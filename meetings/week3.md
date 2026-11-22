# Week 3 Meeting Deliverables

## Agenda (35min)

- **Current App Status** (10min)
  - Demo
- **Added concepts/features** (10min)
  - Streaming => Watching
  - Discussing has edit and delete
  - Guest functionality in sessioning, and Presence concept for tabclose
  - Rooms open til everyone leaves / anyone can end or switch video
- **Tests/Successes** (5min)
  - AI discussion summary + video summary with timestamps / video link is possible
- **UI Recommendations** (5min)
  - Pages: stream, home, history
  - Interactions: starting live watch?
- **Plans/Decisions** (5min)
  - Summary/suggestions

## Current Status

Current App Features:
- Authenticating/Sessioning holding account/guest info
- Presence holding activity status (detect timeout)
- RoomJoining handling private rooms/ownership
- Watching handling video list/synced streaming
- Discussing handling live/historical conversation
- Summarizing giving AI overview of discussion

Addressing last week's questions:
- renamed Streaming to Watching
- added edit + delete to Discussing
- added "join as guest" + presence detection
- room remains open without owner present

Improving UI:
- Overall layout: does it make sense?
- Make more consistent (AI section looks different)
- Watching: live vs. local is unclear => recommendations?
- Discussing: make nested threads like commons?
  - highlighting/popping up closeby threads
  - scrolling (rn page is expanding)

Testing progress:
- **AI**: free credits is working fine (my (Julia) API key), can give YouTube link to summarize video

## Issues

- **Live vs. local indication/interactions.** How to make this clear to the viewer? Interaction with features like "jump to"?
- **Summarizing video.** How important would this feature be? (time/compute vs. usefulness)
- **Tracking discussion.** Suggestions for making it easier to follow the discussion/notice relevant comments as you watch? (scrolling/highlighting idea)


## (post-meeting) Plans and Decisions

TODO

plans for next week and decisions made
