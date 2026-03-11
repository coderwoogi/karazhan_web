//go:build !windows

package launcher

import "os/exec"

func applyDetachedProcessAttributes(cmd *exec.Cmd) {
	// Non-Windows platforms do not need the Windows process group flags.
}
