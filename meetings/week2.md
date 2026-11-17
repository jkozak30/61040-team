# Week 2 Meeting Deliverables

## Agenda (35min)

- **Concept Design Status** (5min)
  - Four key concepts
- **Tests/Successes** (5min)
  - YouTube embed + deploy
  - Panopto embed (via agent help)
  - setting up AI (API key is good, credits tbd)
- **Potential Auth/Sessioning Expansion** (10min)
  - Timeout on leaving the room
  - Login as guest
- **Adapting RoomJoining** (5min)
  - Room hosting vs. owning
  - working with sessioning
  - reassignment
- **Summarizing Video** (5min)
  - Summarizing written for strings/text right now
- **Plans/Decisions** (5min)
  - Summary/suggestions

## Current Status

Problem Framing Ideas:
- Found evidence in favor of shared interactions (study)
- "Watch party method"
- Desire to keep chat history

Concept Design overall:
- **RoomJoining**: (mostly reused) room code, can join by code (history of joins stored), currrent participants stored, *no reassignment?*
- **Streaming**: written for synced interactions, supports skipping/seeking/pause/play, someone rejoining can catch up
- **Discussing**: topic + anchor (video + timestamp), nested replies (can have parent message pointer)
- **Summarizing**: on given topic, just one `summarize` action, assumes access to text "summarizer", *issue: how to encode summarizing video?*

Testing progress:
- **YouTube**: embedding + deployment of embedding works!
- **Panopto:** tried without deployment, but Panopto has embedder API
- **AI**: no credits yet, but API key + prompting works

## Issues

- **Sessioning reuse/modification**: didn't include in concept design, but potentially consider new features (heartbeats/timeout, auto-extending session)
- **Owning vs. hosting in RoomJoining**: two notions of "owning" collapsed into one (hosting and owning), mostly applies to live case, no reassignment, end live on owner leave
- **AI integration**: ideas to screenshot frames (every ~5s around discussion timestamp), AI can also read title from iframe for free. Otherwise need API for transcript (usage limits) => transcript later?


## (post-meeting) Plans and Decisions

- **Consider separating or renaming streaming.**
  - unclear from name "Streaming" that you have a video list / can stream multiple videos
- **Test Gemini capabilities.**
  - Test: give Gemini a YouTube link, and see if it can pull certain frames (list of timestamps)
  - Test: give frames directly
- **Expand discussion capabilities.**
  - should add post editing and deletion
- **"Sign in as guest" can be split into a new small concept.**
  - perhaps could integrate into sessioning, though may stray from intended purpose
  - can defer to later (for now assume all users have accounts)
- **Keep rooms open until the last person leaves.**
  - change: anyone can end the stream (with confirmation), anyone can switch video
  - owner still has authority over the video list
  - owner does not have to be present for the livestream to continue
  - room closes at a manual "end live stream", or once everyone leaves the live watch

<!-- TODO

plans for next week and decisions made

- separate streaming
- gemini: give youtube link, or try passing frames
- can put off guest => very simple additional guest concept
- reassignment => add option to auto-reassign when someone leaves, not requiring transfer when the owner leaves is better
- deleting for discussion (delete thread and edit) -->
