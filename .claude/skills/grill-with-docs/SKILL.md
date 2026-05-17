---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
version: 1.0.0
---

# Grill With Docs

A grilling session that stress-tests your plan against the project's existing domain model, sharpens terminology, and keeps documentation up-to-date as decisions land.

## What to do

- Interview relentlessly about every aspect of the plan until reaching shared understanding
- Walk down each branch of the design tree, resolving dependencies one-by-one
- Provide recommended answers for each question
- Ask questions **one at a time**, waiting for feedback before continuing
- Explore the codebase instead if a question can be answered that way

## Domain Awareness

### File structure patterns

- **Single bounded context**: one `CONTEXT.md` at the repo root (or relevant package root)
- **Multiple bounded contexts**: a `CONTEXT-MAP.md` describing how they relate, plus per-context `CONTEXT.md` files
- **Lazy file creation**: only create `CONTEXT.md` or ADRs when there is something worth recording — don't create empty stubs

### During-session practices

- **Challenge against glossary terms**: if the user says "user" when the glossary says "account holder", flag it and align
- **Sharpen fuzzy language**: push for precise, unambiguous terms before moving on
- **Discuss concrete scenarios**: ground abstract plans in realistic examples
- **Cross-reference with code**: read relevant files to verify assumptions rather than asking the user
- **Update CONTEXT.md inline**: as terms resolve during the grilling, write them into the glossary immediately — don't defer
- **Offer ADRs only when all three criteria are met**:
  1. Hard to reverse
  2. Surprising without context
  3. The result of a real trade-off

## Reference files

Before writing or updating `CONTEXT.md`, read `.claude/skills/grill-with-docs/references/CONTEXT-FORMAT.md` for the exact format, rules, and single-vs-multi-context conventions.

Before writing an ADR, read `.claude/skills/grill-with-docs/references/ADR-FORMAT.md` for the template, numbering scheme, and qualification criteria.

## CONTEXT.md Guidelines

> "CONTEXT.md should be totally devoid of implementation details."

`CONTEXT.md` is a **glossary**, not a spec or scratch pad. It defines the language of the domain — what things are called and what they mean — nothing more. Keep it free of:

- How things are implemented
- Technology choices
- File paths or module names
- Anything that belongs in code comments or a README

## ADR Guidelines

Only write an ADR when the decision is:
1. Hard to reverse (significant cost to undo)
2. Surprising without context (a future reader would question it)
3. The result of a genuine trade-off (there were real alternatives)

If all three aren't true, the decision doesn't need an ADR — just make it.
