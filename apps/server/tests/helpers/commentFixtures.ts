export const commenterId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const commentId = "11111111-1111-4111-8111-111111111111";
export const commentRow = {
  id: commentId,
  station_id: 12,
  user_id: commenterId,
  content: "A meaningful comment",
  status: "pending" as const,
  attachments: [],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
export const commentView = {
  id: commentId,
  stationId: 12,
  content: "A meaningful comment",
  status: "pending" as const,
  attachments: [],
  createdAt: commentRow.createdAt,
  updatedAt: commentRow.updatedAt,
  authorId: commenterId,
  authorUsername: "contributor",
  authorName: "Private Name",
  authorImage: null,
  authorVisibility: "private",
};
