# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Package Manager

Uses **pnpm**.

## Development

- Never start the dev server (`pnpm dev`) or run builds (`pnpm build`). Assume the dev server is already running.
- Always run `pnpm check` after making changes to catch lint and type errors.
