// Loaded with LD_PRELOAD for C/C++ programs. When stdout is a pipe (not a terminal), C stdio
// buffers output in 4 KB blocks, so an interactive prompt would only show up when the program
// exits. Turning buffering off makes output appear the moment the program writes it.
#include <stdio.h>

__attribute__((constructor)) static void lab_unbuffer(void) {
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stderr, NULL, _IONBF, 0);
}
