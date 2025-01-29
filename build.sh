#!/bin/bash
rm -r build
cmake -B build  -G "Unix Makefiles" .
cmake --build build
