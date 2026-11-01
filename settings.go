package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

func (a *App) resolveSettingsFilePath() (string, error) {
	if a.customSettingsPath != "" {
		return a.customSettingsPath, nil
	}
	configDir, err := os.UserConfigDir()
	if err != nil || configDir == "" {
		homeDir, homeErr := os.UserHomeDir()
		if homeErr != nil {
			return "", homeErr
		}
		configDir = filepath.Join(homeDir, ".config")
	}
	return filepath.Join(configDir, "gecko", "settings.json"), nil
}

// LoadSettings reads the JSON settings file from ~/.config/gecko/settings.json.
// If the file does not exist yet, it returns "{}" without error.
func (a *App) LoadSettings() (string, error) {
	settingsPath, err := a.resolveSettingsFilePath()
	if err != nil {
		return "{}", err
	}

	data, err := os.ReadFile(settingsPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "{}", nil
		}
		return "{}", err
	}

	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" {
		return "{}", nil
	}
	return trimmed, nil
}

// SaveSettings atomically writes the JSON settings payload to ~/.config/gecko/settings.json.
func (a *App) SaveSettings(jsonContent string) error {
	settingsPath, err := a.resolveSettingsFilePath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(settingsPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	tmpFile, err := os.CreateTemp(dir, "settings-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmpFile.Name()

	_, writeErr := tmpFile.WriteString(jsonContent)
	closeErr := tmpFile.Close()
	if writeErr != nil {
		_ = os.Remove(tmpPath)
		return writeErr
	}
	if closeErr != nil {
		_ = os.Remove(tmpPath)
		return closeErr
	}

	if err := os.Chmod(tmpPath, 0644); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}

	if err := os.Rename(tmpPath, settingsPath); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}
