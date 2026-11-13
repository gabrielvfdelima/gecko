package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const maxFileSizeBytes int64 = 20 * 1024 * 1024 // 20 MB
const maxBinaryExportBytes int64 = 64 * 1024 * 1024 // 64 MB for exported PDF/images

var ignoredDirectories = map[string]bool{
	".git":         true,
	".DS_Store":    true,
	".vscode":      true,
	".idea":        true,
	"node_modules": true,
	"dist":         true,
	"build":        true,
	"vendor":       true,
	"target":       true,
}

// FileNode represents a directory or file entry in the workspace tree.
type FileNode struct {
	Name      string      `json:"name"`
	Path      string      `json:"path"`
	IsDir     bool        `json:"isDir"`
	ModTime   int64       `json:"modTime"`
	BirthTime int64       `json:"birthTime"`
	Children  []*FileNode `json:"children,omitempty"`
}

// FileDocument represents the loaded content and metadata of a file.
type FileDocument struct {
	Path       string `json:"path"`
	Name       string `json:"name"`
	Content    string `json:"content"`
	LineEnding string `json:"lineEnding"`
	Size       int64  `json:"size"`
}

// FSEventPayload represents a debounced filesystem event sent to the frontend.
type FSEventPayload struct {
	Root string `json:"root"`
	Path string `json:"path"`
	Op   string `json:"op"`
}

// DirectoryEntry represents a subdirectory inside a system directory for the integrated browser.
type DirectoryEntry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	IsHidden bool   `json:"isHidden"`
}

// DirectoryListing represents the contents of a directory for Gecko's native directory browser.
type DirectoryListing struct {
	CurrentPath string           `json:"currentPath"`
	ParentPath  string           `json:"parentPath"`
	Directories []DirectoryEntry `json:"directories"`
}

// App struct holds the application state and Wails runtime context.
type App struct {
	ctx                context.Context
	watcherMu          sync.Mutex
	watcher            *fsnotify.Watcher
	watcherStop        chan struct{}
	watchedRoots       map[string]struct{}
	debounceMu         sync.Mutex
	debounceTimer      map[string]*time.Timer
	closeMu            sync.Mutex
	hasDirtyTabs       bool
	allowQuit          bool
	customSettingsPath string
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{
		watchedRoots:  make(map[string]struct{}),
		debounceTimer: make(map[string]*time.Timer),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// beforeClose intercepts window close requests (e.g. Alt+F4) when unsaved changes exist.
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	a.closeMu.Lock()
	dirty := a.hasDirtyTabs
	allowed := a.allowQuit
	a.closeMu.Unlock()

	if dirty && !allowed {
		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "app:request-close")
		}
		return true
	}
	return false
}

// SetHasDirtyTabs updates whether the frontend currently has unsaved buffers.
func (a *App) SetHasDirtyTabs(hasDirty bool) {
	a.closeMu.Lock()
	a.hasDirtyTabs = hasDirty
	a.closeMu.Unlock()
}

// ForceQuit bypasses the dirty tab guard and closes the application immediately.
func (a *App) ForceQuit() {
	a.closeMu.Lock()
	a.allowQuit = true
	a.closeMu.Unlock()

	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

// shutdown cleans up active file watchers when the app exits.
func (a *App) shutdown(ctx context.Context) {
	a.stopWatcher()
}

// GetClipboardText returns the plain text from the system clipboard via Wails runtime.
func (a *App) GetClipboardText() (string, error) {
	if a.ctx == nil {
		return "", errors.New("contexto do runtime Wails não inicializado")
	}
	return runtime.ClipboardGetText(a.ctx)
}

// SetClipboardText sets the plain text in the system clipboard via Wails runtime.
func (a *App) SetClipboardText(text string) error {
	if a.ctx == nil {
		return errors.New("contexto do runtime Wails não inicializado")
	}
	return runtime.ClipboardSetText(a.ctx, text)
}

// SelectWorkspaceFolder opens the native directory selection dialog and registers the root in the watcher.
func (a *App) SelectWorkspaceFolder() (string, error) {
	if a.ctx == nil {
		return "", errors.New("contexto do runtime Wails não inicializado")
	}

	selectedDir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:                "Abrir Pasta como Workspace",
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}

	selectedDir = strings.TrimSpace(selectedDir)
	if selectedDir == "" {
		return "", nil
	}

	cleanRoot := filepath.Clean(selectedDir)
	if err := a.AddWorkspaceRoot(cleanRoot); err != nil {
		return "", err
	}

	return cleanRoot, nil
}

// CreateWorkspaceFolder asks the user (native dialog) for a name/location, creates the new
// folder on disk and registers it as a workspace root. Returns "" if the user cancels.
func (a *App) CreateWorkspaceFolder() (string, error) {
	if a.ctx == nil {
		return "", errors.New("contexto do runtime Wails não inicializado")
	}

	chosen, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:                "Criar Novo Workspace",
		DefaultFilename:      "novo-workspace",
		CanCreateDirectories: true,
	})
	if err != nil {
		return "", err
	}

	chosen = strings.TrimSpace(chosen)
	if chosen == "" {
		return "", nil
	}

	cleanRoot := filepath.Clean(chosen)
	if info, statErr := os.Stat(cleanRoot); statErr == nil && !info.IsDir() {
		return "", fmt.Errorf("já existe um arquivo com este nome: %s", filepath.Base(cleanRoot))
	}
	if err := os.MkdirAll(cleanRoot, 0755); err != nil {
		return "", err
	}
	if err := a.AddWorkspaceRoot(cleanRoot); err != nil {
		return "", err
	}

	return cleanRoot, nil
}

// PromptSaveFileAs opens the native "Save As" dialog for untitled tabs and returns the chosen .md path.
func (a *App) PromptSaveFileAs(defaultDir string, suggestedName string) (string, error) {
	if a.ctx == nil {
		return "", errors.New("contexto do runtime Wails não inicializado")
	}

	suggestedName = strings.TrimSpace(suggestedName)
	if suggestedName == "" {
		suggestedName = "Sem título-1.md"
	}
	suggestedName = ensureMarkdownExtension(suggestedName)

	chosen, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultDirectory:     strings.TrimSpace(defaultDir),
		DefaultFilename:      suggestedName,
		Title:                "Salvar Arquivo Markdown",
		CanCreateDirectories: true,
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown (*.md)", Pattern: "*.md;*.markdown"},
		},
	})
	if err != nil {
		return "", err
	}

	chosen = strings.TrimSpace(chosen)
	if chosen == "" {
		return "", nil
	}
	return ensureMarkdownExtension(filepath.Clean(chosen)), nil
}

func ensureExportExtension(targetPath string, format string) string {
	clean := strings.TrimSpace(targetPath)
	if clean == "" {
		return clean
	}
	lower := strings.ToLower(clean)
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "pdf":
		if strings.HasSuffix(lower, ".pdf") {
			return clean
		}
		return clean + ".pdf"
	case "png":
		if strings.HasSuffix(lower, ".png") {
			return clean
		}
		return clean + ".png"
	case "jpeg", "jpg":
		if strings.HasSuffix(lower, ".jpg") || strings.HasSuffix(lower, ".jpeg") {
			return clean
		}
		return clean + ".jpg"
	default:
		return clean
	}
}

// PromptSaveExportFile opens the native Save dialog for PDF, PNG, or JPEG exports.
func (a *App) PromptSaveExportFile(defaultDir string, suggestedName string, format string) (string, error) {
	if a.ctx == nil {
		return "", errors.New("contexto do runtime Wails não inicializado")
	}

	normFmt := strings.ToLower(strings.TrimSpace(format))
	title := "Exportar Arquivo"
	var filters []runtime.FileFilter

	switch normFmt {
	case "pdf":
		title = "Exportar Documento como PDF"
		filters = []runtime.FileFilter{
			{DisplayName: "Documento PDF (*.pdf)", Pattern: "*.pdf"},
		}
	case "png":
		title = "Exportar Imagem PNG"
		filters = []runtime.FileFilter{
			{DisplayName: "Imagem PNG (*.png)", Pattern: "*.png"},
		}
	case "jpeg", "jpg":
		title = "Exportar Imagem JPEG"
		filters = []runtime.FileFilter{
			{DisplayName: "Imagem JPEG (*.jpg;*.jpeg)", Pattern: "*.jpg;*.jpeg"},
		}
	default:
		return "", fmt.Errorf("formato de exportação não suportado: %s", format)
	}

	suggestedName = strings.TrimSpace(suggestedName)
	if suggestedName == "" {
		suggestedName = "export"
	}
	suggestedName = ensureExportExtension(suggestedName, normFmt)

	chosen, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultDirectory:     strings.TrimSpace(defaultDir),
		DefaultFilename:      suggestedName,
		Title:                title,
		CanCreateDirectories: true,
		Filters:              filters,
	})
	if err != nil {
		return "", err
	}

	chosen = strings.TrimSpace(chosen)
	if chosen == "" {
		return "", nil
	}
	return ensureExportExtension(filepath.Clean(chosen), normFmt), nil
}

// GetUserStandardDirectories returns real existing user directories (~, Documents, Projects, Desktop).
func (a *App) GetUserStandardDirectories() ([]string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	candidates := []string{
		home,
		filepath.Join(home, "Documents"),
		filepath.Join(home, "Documentos"),
		filepath.Join(home, "Projects"),
		filepath.Join(home, "Projetos"),
		filepath.Join(home, "Workspace"),
		filepath.Join(home, "Desktop"),
		filepath.Join(home, "Área de Trabalho"),
	}

	var results []string
	seen := make(map[string]bool)

	for _, cand := range candidates {
		cand = filepath.Clean(cand)
		if seen[cand] {
			continue
		}
		info, err := os.Stat(cand)
		if err == nil && info.IsDir() {
			results = append(results, cand)
			seen[cand] = true
		}
	}

	return results, nil
}

// GetWorkspaceSubdirectories returns a list of relative subdirectories inside a workspace root (up to depth 3).
func (a *App) GetWorkspaceSubdirectories(wsRoot string) ([]string, error) {
	cleanRoot := filepath.Clean(strings.TrimSpace(wsRoot))
	if cleanRoot == "" {
		return nil, errors.New("caminho de workspace inválido")
	}

	var subdirs []string
	subdirs = append(subdirs, "/") // root directory

	err := filepath.WalkDir(cleanRoot, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if path == cleanRoot {
			return nil
		}

		name := d.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" || name == "dist" || name == "build" || name == "vendor" {
			return filepath.SkipDir
		}

		rel, err := filepath.Rel(cleanRoot, path)
		if err != nil {
			return nil
		}

		parts := strings.Split(filepath.ToSlash(rel), "/")
		if len(parts) > 3 {
			return filepath.SkipDir
		}

		subdirs = append(subdirs, filepath.ToSlash(rel))
		return nil
	})

	if err != nil {
		return nil, err
	}

	return subdirs, nil
}

// ListSystemDirectory returns all subdirectories of a given system directory for the integrated directory browser.
func (a *App) ListSystemDirectory(dirPath string) (*DirectoryListing, error) {
	target := strings.TrimSpace(dirPath)
	if target == "" || target == "~" {
		home, err := os.UserHomeDir()
		if err != nil {
			target = "/"
		} else {
			target = home
		}
	} else if strings.HasPrefix(target, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			target = filepath.Join(home, target[2:])
		}
	}

	cleanPath := filepath.Clean(target)
	info, err := os.Stat(cleanPath)
	if err != nil || !info.IsDir() {
		parent := filepath.Dir(cleanPath)
		if pInfo, pErr := os.Stat(parent); pErr == nil && pInfo.IsDir() {
			cleanPath = parent
		} else if home, hErr := os.UserHomeDir(); hErr == nil {
			cleanPath = home
		} else {
			return nil, fmt.Errorf("diretório inválido: %s", dirPath)
		}
	}

	entries, err := os.ReadDir(cleanPath)
	if err != nil {
		return nil, fmt.Errorf("não foi possível ler o diretório: %w", err)
	}

	dirs := make([]DirectoryEntry, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		isDir := entry.IsDir()
		if !isDir && entry.Type()&fs.ModeSymlink != 0 {
			if sInfo, sErr := os.Stat(filepath.Join(cleanPath, name)); sErr == nil && sInfo.IsDir() {
				isDir = true
			}
		}
		if !isDir {
			continue
		}

		dirs = append(dirs, DirectoryEntry{
			Name:     name,
			Path:     filepath.Join(cleanPath, name),
			IsHidden: strings.HasPrefix(name, "."),
		})
	}

	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})

	parentPath := filepath.Dir(cleanPath)
	if parentPath == cleanPath {
		parentPath = ""
	}

	return &DirectoryListing{
		CurrentPath: cleanPath,
		ParentPath:  parentPath,
		Directories: dirs,
	}, nil
}

// CreateDirectoryAtPath creates a new folder inside parentDir with folderName and returns its absolute path.
func (a *App) CreateDirectoryAtPath(parentDir string, folderName string) (string, error) {
	parentDir = strings.TrimSpace(parentDir)
	folderName = strings.TrimSpace(folderName)

	if parentDir == "" {
		return "", errors.New("diretório pai não informado")
	}
	if folderName == "" {
		return "", errors.New("nome da pasta não informado")
	}

	if strings.ContainsAny(folderName, "/\\:*?\"<>|") {
		return "", fmt.Errorf("o nome da pasta contém caracteres inválidos: %s", folderName)
	}

	targetPath := filepath.Join(parentDir, folderName)
	cleanTarget := filepath.Clean(targetPath)

	if info, err := os.Stat(cleanTarget); err == nil {
		if info.IsDir() {
			return "", fmt.Errorf("já existe uma pasta com o nome '%s' neste local", folderName)
		}
		return "", fmt.Errorf("já existe um arquivo com o nome '%s' neste local", folderName)
	}

	if err := os.MkdirAll(cleanTarget, 0755); err != nil {
		return "", fmt.Errorf("erro ao criar pasta: %w", err)
	}

	return cleanTarget, nil
}

// CreateWorkspaceAtPath creates a new directory inside parentDir with folderName and adds it as a workspace root.
func (a *App) CreateWorkspaceAtPath(parentDir string, folderName string) (string, error) {
	cleanTarget, err := a.CreateDirectoryAtPath(parentDir, folderName)
	if err != nil {
		return "", err
	}

	if err := a.AddWorkspaceRoot(cleanTarget); err != nil {
		return "", err
	}

	return cleanTarget, nil
}

// AddWorkspaceRoot validates a workspace root directory and adds it to the shared fsnotify watcher.
func (a *App) AddWorkspaceRoot(rootPath string) error {
	cleanRoot := filepath.Clean(strings.TrimSpace(rootPath))
	if cleanRoot == "" || cleanRoot == "." {
		return errors.New("caminho da pasta de trabalho inválido")
	}

	info, err := os.Stat(cleanRoot)
	if err != nil {
		return err
	}
	if !info.IsDir() {
		return fmt.Errorf("o caminho especificado não é uma pasta: %s", cleanRoot)
	}

	a.watcherMu.Lock()
	if a.watchedRoots == nil {
		a.watchedRoots = make(map[string]struct{})
	}
	_, alreadyWatched := a.watchedRoots[cleanRoot]
	if a.watcher == nil {
		watcher, wErr := fsnotify.NewWatcher()
		if wErr != nil {
			a.watcherMu.Unlock()
			return wErr
		}
		stopCh := make(chan struct{})
		a.watcher = watcher
		a.watcherStop = stopCh
		go a.watchLoop(watcher, stopCh)
	}
	a.watchedRoots[cleanRoot] = struct{}{}
	a.watcherMu.Unlock()

	if !alreadyWatched {
		a.addDirectoryToWatcher(cleanRoot)
	}
	return nil
}

// RemoveWorkspaceRoot unregisters a workspace root from the watcher without modifying any files on disk.
func (a *App) RemoveWorkspaceRoot(rootPath string) error {
	cleanRoot := filepath.Clean(strings.TrimSpace(rootPath))
	if cleanRoot == "" || cleanRoot == "." {
		return nil
	}

	sep := string(filepath.Separator)
	prefix := cleanRoot + sep

	a.watcherMu.Lock()
	delete(a.watchedRoots, cleanRoot)
	watcher := a.watcher
	remainingRoots := len(a.watchedRoots)
	a.watcherMu.Unlock()

	if watcher != nil {
		for _, watchedPath := range watcher.WatchList() {
			cleanWatched := filepath.Clean(watchedPath)
			if cleanWatched == cleanRoot || strings.HasPrefix(cleanWatched, prefix) {
				// Avoid removing if another remaining workspace root still covers this path
				if a.resolveWatchedRoot(cleanWatched) == "" {
					_ = watcher.Remove(watchedPath)
				}
			}
		}
	}

	a.debounceMu.Lock()
	for k, timer := range a.debounceTimer {
		if k == cleanRoot || strings.HasPrefix(k, prefix) {
			if a.resolveWatchedRoot(k) == "" {
				timer.Stop()
				delete(a.debounceTimer, k)
			}
		}
	}
	a.debounceMu.Unlock()

	if remainingRoots == 0 {
		a.stopWatcher()
	}

	return nil
}

// ReadWorkspaceTree reads the directory structure recursively, sorting folders first and then alphabetically.
func (a *App) ReadWorkspaceTree(rootPath string) (*FileNode, error) {
	cleanRoot := filepath.Clean(strings.TrimSpace(rootPath))
	if cleanRoot == "" || cleanRoot == "." {
		return nil, errors.New("caminho da pasta de trabalho inválido")
	}

	info, err := os.Stat(cleanRoot)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("o caminho especificado não é uma pasta: %s", cleanRoot)
	}

	_ = a.AddWorkspaceRoot(cleanRoot)

	return buildFileTree(cleanRoot)
}

func buildFileTree(currentPath string) (*FileNode, error) {
	info, err := os.Stat(currentPath)
	if err != nil {
		return nil, err
	}

	modMs, birthMs := getFileTimestampsMs(currentPath)

	node := &FileNode{
		Name:      info.Name(),
		Path:      currentPath,
		IsDir:     info.IsDir(),
		ModTime:   modMs,
		BirthTime: birthMs,
	}

	if !info.IsDir() {
		return node, nil
	}

	entries, err := os.ReadDir(currentPath)
	if err != nil {
		return nil, err
	}

	children := make([]*FileNode, 0, len(entries))
	for _, entry := range entries {
		name := entry.Name()
		if shouldIgnoreEntry(name, entry.IsDir()) {
			continue
		}

		childPath := filepath.Join(currentPath, name)
		if entry.IsDir() {
			childNode, err := buildFileTree(childPath)
			if err != nil {
				continue
			}
			children = append(children, childNode)
		} else {
			if !isMarkdownFile(name) {
				continue
			}
			fModMs, fBirthMs := getFileTimestampsMs(childPath)
			children = append(children, &FileNode{
				Name:      name,
				Path:      childPath,
				IsDir:     false,
				ModTime:   fModMs,
				BirthTime: fBirthMs,
			})
		}
	}

	sort.Slice(children, func(i, j int) bool {
		if children[i].IsDir != children[j].IsDir {
			return children[i].IsDir
		}
		lowerI := strings.ToLower(children[i].Name)
		lowerJ := strings.ToLower(children[j].Name)
		if lowerI != lowerJ {
			return lowerI < lowerJ
		}
		return children[i].Name < children[j].Name
	})

	node.Children = children
	return node, nil
}

func shouldIgnoreEntry(name string, isDir bool) bool {
	if name == "" || strings.HasPrefix(name, ".") {
		return true
	}
	if ignoredDirectories[name] {
		return true
	}
	if !isDir && (strings.HasSuffix(name, "~") || strings.HasSuffix(name, ".swp") || strings.HasSuffix(name, ".tmp")) {
		return true
	}
	return false
}

func isMarkdownFile(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".md") || strings.HasSuffix(lower, ".markdown")
}

func ensureMarkdownExtension(targetPath string) string {
	if isMarkdownFile(targetPath) {
		return targetPath
	}
	return targetPath + ".md"
}

// ReadFile reads a file up to 20 MB, detects its line ending (CRLF or LF), and normalizes content to LF for editing.
func (a *App) ReadFile(filePath string) (*FileDocument, error) {
	cleanPath := filepath.Clean(strings.TrimSpace(filePath))
	if cleanPath == "" || cleanPath == "." {
		return nil, errors.New("caminho de arquivo inválido")
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("não é possível abrir uma pasta como arquivo: %s", cleanPath)
	}
	if info.Size() > maxFileSizeBytes {
		return nil, fmt.Errorf("arquivo excede o limite de segurança de 20 MB (%d bytes)", info.Size())
	}

	rawBytes, err := os.ReadFile(cleanPath)
	if err != nil {
		return nil, err
	}

	lineEnding := detectLineEnding(rawBytes)
	normalized := bytes.ReplaceAll(rawBytes, []byte("\r\n"), []byte("\n"))

	return &FileDocument{
		Path:       cleanPath,
		Name:       filepath.Base(cleanPath),
		Content:    string(normalized),
		LineEnding: lineEnding,
		Size:       info.Size(),
	}, nil
}

func detectLineEnding(data []byte) string {
	if bytes.Contains(data, []byte("\r\n")) {
		return "CRLF"
	}
	return "LF"
}

// SaveFile writes content to disk preserving the requested LF or CRLF convention.
func (a *App) SaveFile(filePath string, content string, lineEnding string) (int64, error) {
	cleanPath := filepath.Clean(strings.TrimSpace(filePath))
	if cleanPath == "" || cleanPath == "." {
		return 0, errors.New("caminho de arquivo inválido")
	}

	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	output := normalized
	if strings.EqualFold(strings.TrimSpace(lineEnding), "CRLF") {
		output = strings.ReplaceAll(normalized, "\n", "\r\n")
	}

	data := []byte(output)
	if int64(len(data)) > maxFileSizeBytes {
		return 0, errors.New("conteúdo excede o limite de segurança de 20 MB")
	}

	if err := os.MkdirAll(filepath.Dir(cleanPath), 0755); err != nil {
		return 0, err
	}

	if err := os.WriteFile(cleanPath, data, 0644); err != nil {
		return 0, err
	}

	return int64(len(data)), nil
}

// SaveBinaryFile atomically writes base64-encoded binary data (PDF/PNG/JPEG) to disk.
func (a *App) SaveBinaryFile(filePath string, base64Data string) (int64, error) {
	cleanPath := filepath.Clean(strings.TrimSpace(filePath))
	if cleanPath == "" || cleanPath == "." {
		return 0, errors.New("caminho de arquivo inválido")
	}

	payload := strings.TrimSpace(base64Data)
	if idx := strings.Index(payload, ","); idx != -1 && strings.Contains(payload[:idx], ";base64") {
		payload = payload[idx+1:]
	}

	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return 0, fmt.Errorf("dados binários inválidos: %w", err)
	}
	if int64(len(data)) > maxBinaryExportBytes {
		return 0, errors.New("arquivo exportado excede o limite de segurança de 64 MB")
	}

	dir := filepath.Dir(cleanPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return 0, err
	}

	tmpFile, err := os.CreateTemp(dir, ".gecko-export-*")
	if err != nil {
		if writeErr := os.WriteFile(cleanPath, data, 0644); writeErr != nil {
			return 0, writeErr
		}
		return int64(len(data)), nil
	}

	tmpPath := tmpFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return 0, err
	}
	if err := tmpFile.Chmod(0644); err != nil {
		_ = tmpFile.Close()
		return 0, err
	}
	if err := tmpFile.Close(); err != nil {
		return 0, err
	}
	if err := os.Rename(tmpPath, cleanPath); err != nil {
		return 0, err
	}
	cleanup = false
	return int64(len(data)), nil
}

// CreateEntry creates a new Markdown file or folder on disk.
func (a *App) CreateEntry(targetPath string, isDir bool) error {
	cleanPath := filepath.Clean(strings.TrimSpace(targetPath))
	if cleanPath == "" || cleanPath == "." {
		return errors.New("caminho inválido para criação")
	}

	if !isDir {
		cleanPath = ensureMarkdownExtension(cleanPath)
	}

	if _, err := os.Stat(cleanPath); err == nil {
		return fmt.Errorf("já existe um item com este nome: %s", filepath.Base(cleanPath))
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	if isDir {
		if err := os.MkdirAll(cleanPath, 0755); err != nil {
			return err
		}
		a.addDirectoryToWatcher(cleanPath)
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(cleanPath), 0755); err != nil {
		return err
	}

	return os.WriteFile(cleanPath, []byte(""), 0644)
}

// RenameEntry renames or moves a file or folder on disk.
func (a *App) RenameEntry(oldPath, newPath string) error {
	cleanOld := filepath.Clean(strings.TrimSpace(oldPath))
	cleanNew := filepath.Clean(strings.TrimSpace(newPath))
	if cleanOld == "" || cleanNew == "" || cleanOld == "." || cleanNew == "." {
		return errors.New("caminho inválido para renomeação")
	}

	info, err := os.Stat(cleanOld)
	if err != nil {
		return err
	}

	if !info.IsDir() {
		cleanNew = ensureMarkdownExtension(cleanNew)
	}

	if cleanOld == cleanNew {
		return nil
	}

	if info.IsDir() {
		rel, relErr := filepath.Rel(cleanOld, cleanNew)
		if relErr == nil && (rel == "." || (!strings.HasPrefix(rel, ".."+string(filepath.Separator)) && rel != "..")) {
			return errors.New("não é permitido mover uma pasta para dentro de si mesma")
		}
	}

	if _, err := os.Stat(cleanNew); err == nil {
		return fmt.Errorf("já existe um item no destino: %s", filepath.Base(cleanNew))
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	if err := os.Rename(cleanOld, cleanNew); err != nil {
		return err
	}

	if info.IsDir() {
		a.addDirectoryToWatcher(cleanNew)
	}

	return nil
}

// DeleteEntry removes a file or folder from disk.
func (a *App) DeleteEntry(targetPath string) error {
	cleanPath := filepath.Clean(strings.TrimSpace(targetPath))
	if cleanPath == "" || cleanPath == "." || cleanPath == "/" {
		return errors.New("caminho inválido para exclusão")
	}

	if _, err := os.Stat(cleanPath); err != nil {
		return err
	}

	return os.RemoveAll(cleanPath)
}

func (a *App) stopWatcher() {
	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()

	if a.watcherStop != nil {
		close(a.watcherStop)
		a.watcherStop = nil
	}
	if a.watcher != nil {
		_ = a.watcher.Close()
		a.watcher = nil
	}
	a.watchedRoots = make(map[string]struct{})

	a.debounceMu.Lock()
	for k, timer := range a.debounceTimer {
		timer.Stop()
		delete(a.debounceTimer, k)
	}
	a.debounceMu.Unlock()
}

func (a *App) resolveWatchedRoot(filePath string) string {
	cleanPath := filepath.Clean(filePath)
	sep := string(filepath.Separator)

	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()

	bestRoot := ""
	for root := range a.watchedRoots {
		if cleanPath == root || strings.HasPrefix(cleanPath, root+sep) {
			if len(root) > len(bestRoot) {
				bestRoot = root
			}
		}
	}
	return bestRoot
}

func (a *App) addDirectoryToWatcher(rootPath string) {
	a.watcherMu.Lock()
	watcher := a.watcher
	a.watcherMu.Unlock()

	if watcher == nil {
		return
	}

	_ = filepath.WalkDir(rootPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if path != rootPath && shouldIgnoreEntry(d.Name(), true) {
			return filepath.SkipDir
		}
		_ = watcher.Add(path)
		return nil
	})
}

func (a *App) watchLoop(watcher *fsnotify.Watcher, stopCh chan struct{}) {
	for {
		select {
		case <-stopCh:
			return
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			cleanPath := filepath.Clean(event.Name)
			baseName := filepath.Base(cleanPath)

			info, statErr := os.Stat(cleanPath)
			isDir := statErr == nil && info.IsDir()

			if shouldIgnoreEntry(baseName, isDir) {
				continue
			}

			if event.Has(fsnotify.Create) && isDir {
				a.addDirectoryToWatcher(cleanPath)
			}

			if !isDir && statErr == nil && !isMarkdownFile(baseName) {
				continue
			}

			opName := event.Op.String()
			a.scheduleDebouncedEvent(cleanPath, opName)

		case _, ok := <-watcher.Errors:
			if !ok {
				return
			}
		}
	}
}

func (a *App) scheduleDebouncedEvent(filePath string, op string) {
	a.debounceMu.Lock()
	defer a.debounceMu.Unlock()

	if existing, exists := a.debounceTimer[filePath]; exists {
		existing.Stop()
	}

	a.debounceTimer[filePath] = time.AfterFunc(200*time.Millisecond, func() {
		a.debounceMu.Lock()
		delete(a.debounceTimer, filePath)
		a.debounceMu.Unlock()

		root := a.resolveWatchedRoot(filePath)
		if root == "" {
			return
		}

		if a.ctx != nil {
			runtime.EventsEmit(a.ctx, "workspace:fs-event", FSEventPayload{
				Root: root,
				Path: filePath,
				Op:   op,
			})
		}
	})
}
