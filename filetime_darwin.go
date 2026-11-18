//go:build darwin

package main

import (
	"os"

	"golang.org/x/sys/unix"
)

func getFileTimestampsMs(path string) (modTimeMs int64, birthTimeMs int64) {
	var st unix.Stat_t
	err := unix.Lstat(path, &st)
	if err == nil {
		modTimeMs = int64(st.Mtim.Sec)*1000 + int64(st.Mtim.Nsec)/1e6
		if st.Btim.Sec > 0 {
			birthTimeMs = int64(st.Btim.Sec)*1000 + int64(st.Btim.Nsec)/1e6
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
