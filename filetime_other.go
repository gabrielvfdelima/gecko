//go:build !linux

package main

import "os"

func getFileTimestampsMs(path string) (modTimeMs int64, birthTimeMs int64) {
	info, err := os.Stat(path)
	if err != nil {
		return 0, 0
	}
	ms := info.ModTime().UnixMilli()
	return ms, ms
}
