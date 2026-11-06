# Week 1 Meeting Deliverables

## Agenda (35min)

- **Intro/Project Summary** (5min)
  - Bad Situation
  - Solution ideas overview
  - Global thoughts/feedback
- **Issue: AI** (5min)
  - Using AI API
  - Capacity for summarizing video
- **Issue: Video Syncing** (10min)
  - Value/capacity of this feature
  - HTTP/WebSocket
- **Issue: Platform Integration** (5min)
  - YouTube => Panopto
- **Issue: Video Player** (5min)
  - Ads/Restrictions
  - Experimentation
- **Plans/Decisions** (5min)
  - Summary/suggestions

## Project Summary

### Our Bad Situation

- Context
  - Synchronous lecture/recitations let you ask questions, but not move at your own pace
  - Asynchronous recordings offer the opposite
- Rewatching lecture videos (pre-exam, study group)
  - **Overall** poor capacity for collaboration virtually
  - Centralized controls
  - Reduced video quality
  - Lost discussion context
- Comparable platforms
  - SharePlay (synced playback)
  - Watch2Gether


### Our Solution Ideas

- Live mode: shared playback
  - Integrated video player
    - YouTube or others?
  - Shared pausing/rewinding/fast-forwarding
  - Live chat
    - tied to ID/account
    - nested replies
- Historical mode: independent playback
  - Video still available
  - Discussion/chat still available for review/contribution
- AI-powered summary tool
  - Summarize discussion
  - Summarize video content?

## Issues

- **Thoughts on AI summary?**
  - We are new to using/integrating the Gemini API, so we would like to get a sense of whether AI summary of discussion (and video content) is a reasonable goal.
  - Process video?
- **How should we go about syncing video?**
  - We want to decide what the best approach is for syncing video, and whether it is worth our effort to keep this feature. We think that a WebSockets-style approach would be ideal, though we can alternatively use HTTP/polling (each has tradeoffs).
  - HTTP sufficient? polling-based updates, higher/variable latency
  - WebSockets? compatibility with sync-engine
  - Scrap/de-emphasize syncing?
- **Which platforms should we try to integrate?**
  - We’re planning to start with YouTube, and want to decide whether Panopto/other platforms is a realistic stretch goal given the work needed to integrate another player.
  - goal: MVP is YouTube
    - seems to have no usage limits
  - Is a reasonable stretch goal to integrate Panopto?
- **Dealing with integrated video player**
  - We want to get a sense of what it is like to work with an integrated YouTube player, and when/how we should explore this early on.
  - YouTube ads?

## (post-meeting) Plans and Decisions

TODO

plans for next week and decisions made