package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"log"
	"net/http"
	"runtime"
	"strconv"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

var bootSettingsPlaceholder = []byte(`"__GECKO_BOOT_SETTINGS_PLACEHOLDER__"`)

type indexResponseRecorder struct {
	header http.Header
	body   bytes.Buffer
	code   int
}

func (r *indexResponseRecorder) Header() http.Header {
	return r.header
}

func (r *indexResponseRecorder) Write(b []byte) (int, error) {
	if r.code == 0 {
		r.code = http.StatusOK
	}
	return r.body.Write(b)
}

func (r *indexResponseRecorder) WriteHeader(statusCode int) {
	if r.code == 0 {
		r.code = statusCode
	}
}

func resolveBootSettingsJSON(app *App) []byte {
	raw, err := app.LoadSettings()
	trimmed := strings.TrimSpace(raw)
	if err != nil || trimmed == "" || !json.Valid([]byte(trimmed)) {
		return []byte("{}")
	}
	// Prevent accidental </script> termination inside inline HTML <script>
	safe := strings.ReplaceAll(trimmed, "</", `<\/`)
	return []byte(safe)
}

func main() {
	app := NewApp()

	var appMenu *menu.Menu
	if runtime.GOOS == "darwin" {
		// macOS WKWebView requires an application Edit menu for native Cmd+C/V/X/A/Z in inputs.
		appMenu = menu.NewMenuFromItems(
			menu.AppMenu(),
			menu.EditMenu(),
			menu.WindowMenu(),
		)
	}

	err := wails.Run(&options.App{
		Title:     "Gecko",
		Width:     1280,
		Height:    820,
		MinWidth:  720,
		MinHeight: 480,
		Frameless: runtime.GOOS != "darwin",
		Menu:      appMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
			Middleware: func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.Method == http.MethodGet &&
						(r.URL.Path == "/" || r.URL.Path == "" || r.URL.Path == "/index.html") {
						rec := &indexResponseRecorder{header: make(http.Header)}
						next.ServeHTTP(rec, r)

						for k, vals := range rec.header {
							if strings.EqualFold(k, "Content-Length") {
								continue
							}
							for _, v := range vals {
								w.Header().Add(k, v)
							}
						}

						bodyBytes := rec.body.Bytes()
						if rec.code == http.StatusOK && bytes.Contains(bodyBytes, bootSettingsPlaceholder) {
							bodyBytes = bytes.Replace(
								bodyBytes,
								bootSettingsPlaceholder,
								resolveBootSettingsJSON(app),
								1,
							)
							w.Header().Set("Cache-Control", "no-store")
						}

						w.Header().Set("Content-Length", strconv.Itoa(len(bodyBytes)))
						if rec.code != 0 {
							w.WriteHeader(rec.code)
						}
						_, _ = w.Write(bodyBytes)
						return
					}
					if (r.Method == http.MethodGet || r.Method == http.MethodHead) &&
						r.URL.Path == "/__gecko_local_image" {
						app.serveLocalImageHTTP(w, r)
						return
					}
					next.ServeHTTP(w, r)
				})
			},
		},
		BackgroundColour: &options.RGBA{R: 24, G: 24, B: 24, A: 255},
		OnStartup:        app.startup,
		OnBeforeClose:    app.beforeClose,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
		Linux: &linux.Options{
			Icon: appIcon,
		},
		Mac: &mac.Options{
			TitleBar:                     mac.TitleBarHiddenInset(),
			Appearance:                   mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent:         false,
			WindowIsTranslucent:          false,
			DisableEscapeExitsFullscreen: true,
			About: &mac.AboutInfo{
				Title:   "Gecko",
				Message: "Editor de texto e Markdown para desktop.",
				Icon:    appIcon,
			},
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			DisableWindowIcon:    false,
		},
	})

	if err != nil {
		log.Fatal(err)
	}
}
