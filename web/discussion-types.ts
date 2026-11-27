export type DiscussionMessage = {
  message: string;
  parent: string | null;
  author: string;
  name: string;
  text: string;
  context: "LIVE" | "HISTORICAL";
  postedAt: string;
  editedAt?: string;
  deletedAt?: string;
};

export type DiscussionThread = {
  thread: string;
  anchor: number;
  messages: DiscussionMessage[];
};

export type DiscussionFocus = {
  thread: string;
  message?: string;
  id: number;
  holdReading?: boolean;
};

