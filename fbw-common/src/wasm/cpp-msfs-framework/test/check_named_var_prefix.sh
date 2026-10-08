#!/bin/bash
# Copyright (c) 2026 FlyByWire Simulations
# SPDX-License-Identifier: GPL-3.0
#
# Static check of the LVar names given to DataManager::make_named_var() - no MSFS SDK needed.
#
# make_named_var() adds the aircraft prefix ("A32NX_") to the name unless its last parameter, noPrefix, is true
# (MsfsHandler/DataManager.h). A sim LVar whose name does not start with that prefix (XMLVAR_*, A380X_*, ...)
# must therefore be created with all six parameters and noPrefix = true. Otherwise the module silently reads the
# non-existent L:A32NX_<name>, which is always 0 (this hid the ENG MODE selector from both FADECs).
#
# Rule checked in every .h/.hpp/.cpp file of the given folders, for each call whose name is a string literal:
#   - the name starts with the prefix ("A32NX_..."), or
#   - the call has six arguments and the last one is `true` (a `true` in an earlier slot would become maxAgeTime).
# Calls with a computed name (prefix + "...") are not checked.
#
# usage: bash check_named_var_prefix.sh <source folder>...
set -e

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <source folder>..." >&2
  exit 2
fi

mapfile -t files < <(find "$@" -type f \( -name '*.h' -o -name '*.hpp' -o -name '*.cpp' \) | sort)
if [ "${#files[@]}" -eq 0 ]; then
  echo "FAIL make_named_var prefix check: no source file in $*" >&2
  exit 1
fi

awk -v prefix="A32NX_" '
  # Splits the argument list of the call that starts in `text` at the first "(" and reports a wrong name.
  function checkCall(text, file, line,    i, c, depth, inString, arg, n, args, name, last) {
    depth = 0; inString = 0; arg = ""; n = 0
    for (i = index(text, "("); i <= length(text); i++) {
      c = substr(text, i, 1)
      if (inString) {
        arg = arg c
        if (c == "\\") { i++; arg = arg substr(text, i, 1) } else if (c == "\"") inString = 0
        continue
      }
      if (c == "\"") { inString = 1; arg = arg c; continue }
      if (c == "(") { depth++; if (depth == 1) continue }
      if (c == ")") { depth--; if (depth == 0) break }
      if (c == "," && depth == 1) { args[++n] = arg; arg = ""; continue }
      arg = arg c
    }
    if (arg ~ /[^ \t\r\n]/) args[++n] = arg
    checked++

    name = args[1]; gsub(/^[ \t\r\n]+|[ \t\r\n]+$/, "", name)
    if (substr(name, 1, 1) != "\"") return                # computed name: not checked
    if (substr(name, 2, length(prefix)) == prefix) return # already prefixed in the sim

    last = args[n]; gsub(/^[ \t\r\n]+|[ \t\r\n]+$/, "", last)
    if (n != 6 || last != "true") {
      printf "FAIL %s:%d: make_named_var(%s, ...) would read L:%s%s - pass noPrefix = true as the 6th argument\n", file, line, name, prefix, substr(name, 2, length(name) - 2)
      failures++
    }
  }

  FNR == 1 { pending = "" }
  {
    if (pending == "") {
      start = index($0, "make_named_var(")
      if (start == 0) next
      pending = substr($0, start); startLine = FNR; startFile = FILENAME
    } else {
      pending = pending "\n" $0
    }
    # Wait for the closing parenthesis of the call (a call may span several lines).
    opened = gsub(/\(/, "(", pending); closed = gsub(/\)/, ")", pending)
    if (closed >= opened) { checkCall(pending, startFile, startLine); pending = "" }
  }

  END {
    if (failures > 0) { printf "FAIL make_named_var prefix check: %d of %d calls\n", failures, checked; exit 1 }
    printf "OK make_named_var prefix check: %d calls\n", checked
  }
' "${files[@]}"
