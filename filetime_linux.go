//go:build linux

package main

import (
	"os"

	"golang.org/x/sys/unix"
)

func getFileTimestampsMs(path string) (modTimeMs int64, birthTimeMs int64) {
	var stx unix.Statx_t
	err := unix.Statx(unix.AT_FDCWD, path, unix.AT_SYMLINK_NOFOLLOW, unix.STATX_MTIME|unix.STATX_BTIME, &stx)
	if err == nil {
		modTimeMs = int64(stx.Mtime.Sec)*1000 + int64(stx.Mtime.Nsec)/1e6
		if stx.Mask&unix.STATX_BTIME != 0 && stx.Btime.Sec > 0 {
			birthTimeMs = int64(stx.Btime.Sec)*1000 + int64(stx.Btime.Nsec)/1e6
		} else {
			birthTimeMs = modTimeMs
		}
		return modTimeMs, birthTimeMs
	}

	info, statErr := os.Stat(path)
	if statErr == nil {
		ms := info.ModTime().UnixMilli()
		return ms, ms
	}
	return 0, 0
}
