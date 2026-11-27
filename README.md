# 6.1040 Team Project

This repo contains the 6.1040 final team project of Julia Kozak, Hunter Liao, and Sophia Min.

## Links to Project Files

- [F2: Problem Framing (earlier draft)](./docs/f2.md)
- [F3: Concept Design](./docs/f3.md)
  - [Problem Framing](./docs/f3.md#revised-problem-framing)
  - [Concept Design](./docs/f3.md#concept-design)
  - [User Journey](./docs/f3.md#user-journey)
  - [Visual Design Study](./docs/f3.md#visual-design-study)
  - [Live watch and later review screen study](./docs/imgs/f3-screen-study.svg)
  - [Design Summary](./docs/f3.md#design-summary)
  - [Development Plan](./docs/f3.md#development-plan)
- [F4: Alpha Checkpoint](./docs/f4.md)
  - [Source Code](./docs/f4.md#source-code)
  - [Updated Designs](./docs/f4.md#updated-designs)
  - [Updated Development Plan](./docs/f4.md#updated-development-plan)
  - [Deployed App](https://watchparty.mit-sdg.dev/)
  - [Screen Recording](https://youtu.be/MEwEB7-zmpI)
- [F5: Beta Checkpoint](./docs/f5.md)
  - [Source Code](./docs/f5.md#source-code)
  - [Tests](./docs/f5.md#tests)
  - [Updated Designs](./docs/f5.md#updated-designs)
  - [Updated Development Plan](./docs/f5.md#updated-development-plan)
  - [Deployed App](https://watchparty.mit-sdg.dev/) -- TODO
  - Screen Recording -- TODO

## General Setup Instructions

0. The prerequisite software for running tests is Bun and Podman + Compose, with installation as specified [here](https://61040.github.io/fa26/resources/mongodb-setup/) (steps 1 & 3).
1. Within a cloned copy of this repo, create `.env` with the same contents as `.env.example`: 
```
cp .env.example .env
```
*Note:* if you would like to use live AI features, addtionally fill in the `GEMINI_API_KEY` line in `.env` with your own API key:
```
GEMINI_API_KEY=your_api_key_here
```
2. Install dependencies:
```
bun install
```

## Instructions for Running Tests

0. Follow the setup steps outlined in [General Setup Instructions](#general-setup-instructions).
1. Start the DB instance:
```
bun run db:up
```
2. Once that succeeds, run the testbench:
```
bun run test
```

A saved passing test run is available [here](./docs/test-results.txt).

3. When finished, you can stop the database:
```
bun run db:down
```
