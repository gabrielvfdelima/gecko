package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkspaceTreeAndFileOperations(t *testing.T) {
	tmpDir := t.TempDir()
	app := NewApp()

	// 1. Create entries (folders & markdown files, testing auto .md extension)
	if err := app.CreateEntry(filepath.Join(tmpDir, "docs"), true); err != nil {
		t.Fatalf("CreateEntry dir failed: %v", err)
	}
	if err := app.CreateEntry(filepath.Join(tmpDir, "notas"), false); err != nil {
		t.Fatalf("CreateEntry file without extension failed: %v", err)
	}
	if err := app.CreateEntry(filepath.Join(tmpDir, "docs", "arquitetura.md"), false); err != nil {
		t.Fatalf("CreateEntry nested md failed: %v", err)
	}

	// Create ignored folders/files (.git, node_modules, non-md file)
	_ = os.MkdirAll(filepath.Join(tmpDir, ".git"), 0755)
	_ = os.MkdirAll(filepath.Join(tmpDir, "node_modules"), 0755)
	_ = os.WriteFile(filepath.Join(tmpDir, "ignorar.txt"), []byte("ignore"), 0644)

	// 2. ReadWorkspaceTree should sort folders first, ignore .git/node_modules/non-md, and populate ModTime/BirthTime
	tree, err := app.ReadWorkspaceTree(tmpDir)
	if err != nil {
		t.Fatalf("ReadWorkspaceTree failed: %v", err)
	}
	if len(tree.Children) != 2 {
		t.Fatalf("expected 2 children in root (docs dir and notas.md), got %d", len(tree.Children))
	}
	if !tree.Children[0].IsDir || tree.Children[0].Name != "docs" {
		t.Errorf("expected first child to be dir 'docs', got %+v", tree.Children[0])
	}
	if tree.Children[0].ModTime <= 0 || tree.Children[0].BirthTime <= 0 {
		t.Errorf("expected positive ModTime and BirthTime on dir, got mod=%d birth=%d", tree.Children[0].ModTime, tree.Children[0].BirthTime)
	}
	if tree.Children[1].IsDir || tree.Children[1].Name != "notas.md" {
		t.Errorf("expected second child to be file 'notas.md', got %+v", tree.Children[1])
	}
	if tree.Children[1].ModTime <= 0 || tree.Children[1].BirthTime <= 0 {
		t.Errorf("expected positive ModTime and BirthTime on file, got mod=%d birth=%d", tree.Children[1].ModTime, tree.Children[1].BirthTime)
	}

	// 3. SaveFile & ReadFile with CRLF preservation
	notasPath := filepath.Join(tmpDir, "notas.md")
	written, err := app.SaveFile(notasPath, "# Titulo\nLinha 2", "CRLF")
	if err != nil {
		t.Fatalf("SaveFile CRLF failed: %v", err)
	}
	if written <= 0 {
		t.Errorf("expected positive bytes written, got %d", written)
	}

	rawBytes, err := os.ReadFile(notasPath)
	if err != nil {
		t.Fatalf("os.ReadFile failed: %v", err)
	}
	if !strings.Contains(string(rawBytes), "\r\n") {
		t.Errorf("expected CRLF on disk, got %q", string(rawBytes))
	}

	doc, err := app.ReadFile(notasPath)
	if err != nil {
		t.Fatalf("ReadFile failed: %v", err)
	}
	if doc.LineEnding != "CRLF" {
		t.Errorf("expected detected lineEnding CRLF, got %s", doc.LineEnding)
	}
	if doc.Content != "# Titulo\nLinha 2" {
		t.Errorf("expected normalized LF content for editor, got %q", doc.Content)
	}

	// 4. RenameEntry (without extension should auto-append .md)
	renamedPath := filepath.Join(tmpDir, "notas-renomeadas")
	if err := app.RenameEntry(notasPath, renamedPath); err != nil {
		t.Fatalf("RenameEntry failed: %v", err)
	}
	expectedRenamed := filepath.Join(tmpDir, "notas-renomeadas.md")
	if _, err := os.Stat(expectedRenamed); err != nil {
		t.Errorf("expected renamed file at %s, err: %v", expectedRenamed, err)
	}

	// 5. RenameEntry should reject moving a folder into itself or its own subfolder
	docsDir := filepath.Join(tmpDir, "docs")
	invalidTarget := filepath.Join(docsDir, "sub", "docs")
	if err := app.RenameEntry(docsDir, invalidTarget); err == nil {
		t.Errorf("expected RenameEntry to reject moving directory into its own subdirectory")
	}

	// 6. DeleteEntry
	if err := app.DeleteEntry(expectedRenamed); err != nil {
		t.Fatalf("DeleteEntry failed: %v", err)
	}
	if _, err := os.Stat(expectedRenamed); !os.IsNotExist(err) {
		t.Errorf("expected file to be deleted")
	}
}

func TestSettingsPersistenceAndBeforeClose(t *testing.T) {
	tmpDir := t.TempDir()
	app := NewApp()
	app.customSettingsPath = filepath.Join(tmpDir, "gecko", "settings.json")

	// Default when file does not exist
	initial, err := app.LoadSettings()
	if err != nil {
		t.Fatalf("LoadSettings initial failed: %v", err)
	}
	if initial != "{}" {
		t.Errorf("expected '{}', got %q", initial)
	}

	payload := `{"lastWorkspace":"/tmp/ws","sort":{"mode":"modTime","dir":"desc"}}`
	if err := app.SaveSettings(payload); err != nil {
		t.Fatalf("SaveSettings failed: %v", err)
	}

	loaded, err := app.LoadSettings()
	if err != nil {
		t.Fatalf("LoadSettings after save failed: %v", err)
	}
	if loaded != payload {
		t.Errorf("expected %q, got %q", payload, loaded)
	}

	// Verify beforeClose behavior
	if app.beforeClose(nil) {
		t.Errorf("expected beforeClose=false when no dirty tabs")
	}
	app.SetHasDirtyTabs(true)
	if !app.beforeClose(nil) {
		t.Errorf("expected beforeClose=true when dirty tabs exist")
	}
	app.ForceQuit()
	if app.beforeClose(nil) {
		t.Errorf("expected beforeClose=false after ForceQuit")
	}
}

func TestMultiWorkspaceRootsAndSafeRemoval(t *testing.T) {
	wsA := t.TempDir()
	wsB := t.TempDir()
	app := NewApp()
	defer app.shutdown(nil)

	fileA := filepath.Join(wsA, "doc-a.md")
	fileB := filepath.Join(wsB, "sub", "doc-b.md")
	if err := app.CreateEntry(fileA, false); err != nil {
		t.Fatalf("CreateEntry fileA failed: %v", err)
	}
	if err := app.CreateEntry(fileB, false); err != nil {
		t.Fatalf("CreateEntry fileB failed: %v", err)
	}

	// 1. Add two workspace roots + idempotent duplicate check
	if err := app.AddWorkspaceRoot(wsA); err != nil {
		t.Fatalf("AddWorkspaceRoot wsA failed: %v", err)
	}
	if err := app.AddWorkspaceRoot(wsA); err != nil {
		t.Fatalf("AddWorkspaceRoot duplicate wsA failed: %v", err)
	}
	if err := app.AddWorkspaceRoot(wsB); err != nil {
		t.Fatalf("AddWorkspaceRoot wsB failed: %v", err)
	}

	if got := app.resolveWatchedRoot(fileA); got != filepath.Clean(wsA) {
		t.Errorf("expected resolveWatchedRoot(fileA)=%q, got %q", wsA, got)
	}
	if got := app.resolveWatchedRoot(fileB); got != filepath.Clean(wsB) {
		t.Errorf("expected resolveWatchedRoot(fileB)=%q, got %q", wsB, got)
	}

	// 2. Remove wsA from sidebar/watcher; verify files on disk remain intact
	if err := app.RemoveWorkspaceRoot(wsA); err != nil {
		t.Fatalf("RemoveWorkspaceRoot wsA failed: %v", err)
	}
	if _, err := os.Stat(fileA); err != nil {
		t.Errorf("expected fileA to remain untouched on disk after RemoveWorkspaceRoot, got err: %v", err)
	}
	if got := app.resolveWatchedRoot(fileA); got != "" {
		t.Errorf("expected resolveWatchedRoot(fileA)='' after removal, got %q", got)
	}
	if got := app.resolveWatchedRoot(fileB); got != filepath.Clean(wsB) {
		t.Errorf("expected wsB to remain watched, got %q", got)
	}

	// 3. Remove last workspace root -> watcher stops cleanly
	if err := app.RemoveWorkspaceRoot(wsB); err != nil {
		t.Fatalf("RemoveWorkspaceRoot wsB failed: %v", err)
	}
	if _, err := os.Stat(fileB); err != nil {
		t.Errorf("expected fileB to remain untouched on disk after RemoveWorkspaceRoot, got err: %v", err)
	}
}

func TestIntegratedModalHelpers(t *testing.T) {
	app := NewApp()
	tmpDir := t.TempDir()

	// 1. GetUserStandardDirectories
	dirs, err := app.GetUserStandardDirectories()
	if err != nil {
		t.Fatalf("GetUserStandardDirectories failed: %v", err)
	}
	if len(dirs) == 0 {
		t.Errorf("expected at least 1 standard directory (home), got 0")
	}

	// 2. CreateWorkspaceAtPath
	created, err := app.CreateWorkspaceAtPath(tmpDir, "novo-projeto")
	if err != nil {
		t.Fatalf("CreateWorkspaceAtPath failed: %v", err)
	}
	if filepath.Base(created) != "novo-projeto" {
		t.Errorf("expected base name 'novo-projeto', got %s", filepath.Base(created))
	}
	if info, err := os.Stat(created); err != nil || !info.IsDir() {
		t.Errorf("expected created directory to exist on disk")
	}

	// Duplicate should fail
	if _, err := app.CreateWorkspaceAtPath(tmpDir, "novo-projeto"); err == nil {
		t.Errorf("expected error when creating duplicate workspace name, got nil")
	}

	// Invalid characters should fail
	if _, err := app.CreateWorkspaceAtPath(tmpDir, "invalid/name"); err == nil {
		t.Errorf("expected error with slash in folder name, got nil")
	}

	// 3. GetWorkspaceSubdirectories
	subB := filepath.Join(created, "subA", "subB")
	_ = os.MkdirAll(subB, 0755)

	subs, err := app.GetWorkspaceSubdirectories(created)
	if err != nil {
		t.Fatalf("GetWorkspaceSubdirectories failed: %v", err)
	}
	if len(subs) < 3 {
		t.Errorf("expected at least 3 subdirs ('/', 'subA', 'subA/subB'), got %v", subs)
	}

	// 4. CreateDirectoryAtPath and ListSystemDirectory (visible + hidden dot-directory)
	_, err = app.CreateDirectoryAtPath(created, ".oculto")
	if err != nil {
		t.Fatalf("CreateDirectoryAtPath(.oculto) failed: %v", err)
	}
	_, err = app.CreateDirectoryAtPath(created, "visivel")
	if err != nil {
		t.Fatalf("CreateDirectoryAtPath(visivel) failed: %v", err)
	}

	listing, err := app.ListSystemDirectory(created)
	if err != nil {
		t.Fatalf("ListSystemDirectory failed: %v", err)
	}
	if listing.CurrentPath != created {
		t.Errorf("expected CurrentPath %s, got %s", created, listing.CurrentPath)
	}
	if listing.ParentPath != tmpDir {
		t.Errorf("expected ParentPath %s, got %s", tmpDir, listing.ParentPath)
	}

	foundHidden := false
	foundVisible := false
	for _, d := range listing.Directories {
		if d.Name == ".oculto" && d.IsHidden {
			foundHidden = true
		}
		if d.Name == "visivel" && !d.IsHidden {
			foundVisible = true
		}
	}
	if !foundHidden || !foundVisible {
		t.Errorf("expected both .oculto (hidden) and visivel (not hidden) in listing: %+v", listing.Directories)
	}
}

func TestClipboardHelpers(t *testing.T) {
	app := NewApp()
	// When ctx is nil (uninitialized Wails runtime), it should safely return error
	if _, err := app.GetClipboardText(); err == nil {
		t.Errorf("expected error when ctx is nil, got nil")
	}
	if err := app.SetClipboardText("test"); err == nil {
		t.Errorf("expected error when ctx is nil, got nil")
	}
}
