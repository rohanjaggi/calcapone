import { describe, it, expect } from "vitest";
import { forwardSourceLine, type ForwardOrigin } from "@/lib/services/forward-source";

describe("forwardSourceLine", () => {
  describe("channel variant", () => {
    it("uses the channel title for a private channel", () => {
      expect(
        forwardSourceLine({
          type: "channel",
          title: "My Secret Channel",
        })
      ).toBe("Forwarded from My Secret Channel");
    });

    it("appends the link for a public channel with username and message_id", () => {
      expect(
        forwardSourceLine({
          type: "channel",
          title: "Public News",
          username: "news_channel",
          message_id: 42,
        })
      ).toBe("Forwarded from Public News — https://t.me/news_channel/42");
    });

    it("omits the link when username is missing", () => {
      expect(
        forwardSourceLine({
          type: "channel",
          title: "Channel Without Username",
          message_id: 42,
        })
      ).toBe("Forwarded from Channel Without Username");
    });

    it("omits the link when message_id is missing", () => {
      expect(
        forwardSourceLine({
          type: "channel",
          title: "Channel Without Message ID",
          username: "some_channel",
        })
      ).toBe("Forwarded from Channel Without Message ID");
    });

    it("omits the link when username is an empty string", () => {
      expect(
        forwardSourceLine({
          type: "channel",
          title: "Channel",
          username: "",
          message_id: 42,
        })
      ).toBe("Forwarded from Channel");
    });

    it("omits the link when message_id is zero or negative", () => {
      expect(
        forwardSourceLine({
          type: "channel",
          title: "Channel",
          username: "ch",
          message_id: 0,
        })
      ).toBe("Forwarded from Channel");

      expect(
        forwardSourceLine({
          type: "channel",
          title: "Channel",
          username: "ch",
          message_id: -1,
        })
      ).toBe("Forwarded from Channel");
    });

    it("returns null when title is missing", () => {
      expect(
        forwardSourceLine({
          type: "channel",
          username: "news_channel",
          message_id: 42,
        })
      ).toBeNull();
    });
  });

  describe("chat variant", () => {
    it("uses the chat title", () => {
      expect(
        forwardSourceLine({
          type: "chat",
          title: "Group Chat Name",
        })
      ).toBe("Forwarded from Group Chat Name");
    });

    it("returns null when title is missing", () => {
      expect(forwardSourceLine({ type: "chat" })).toBeNull();
    });
  });

  describe("user variant", () => {
    it("uses first name alone when last name is absent", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: "Alice",
        })
      ).toBe("Forwarded from Alice");
    });

    it("uses first and last name when both are present", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: "Alice",
          last_name: "Smith",
        })
      ).toBe("Forwarded from Alice Smith");
    });

    it("adds @username when present", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: "Bob",
          username: "bob_123",
        })
      ).toBe("Forwarded from Bob @bob_123");
    });

    it("combines name and username", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: "Carol",
          last_name: "Jones",
          username: "carol_j",
        })
      ).toBe("Forwarded from Carol Jones @carol_j");
    });

    it("uses only @username when first_name is absent", () => {
      expect(
        forwardSourceLine({
          type: "user",
          username: "solo_username",
        })
      ).toBe("Forwarded from @solo_username");
    });

    it("ignores an empty last_name", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: "David",
          last_name: "",
        })
      ).toBe("Forwarded from David");
    });

    it("ignores an empty username", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: "Eve",
          username: "",
        })
      ).toBe("Forwarded from Eve");
    });

    it("returns null when first_name is absent and no username", () => {
      expect(
        forwardSourceLine({
          type: "user",
          last_name: "Orphaned",
        })
      ).toBeNull();
    });
  });

  describe("hidden_user variant", () => {
    it("uses sender_user_name", () => {
      expect(
        forwardSourceLine({
          type: "hidden_user",
          sender_user_name: "Anonymous User",
        })
      ).toBe("Forwarded from Anonymous User");
    });

    it("returns null when sender_user_name is missing", () => {
      expect(forwardSourceLine({ type: "hidden_user" })).toBeNull();
    });
  });

  describe("null and undefined", () => {
    it("returns null for null", () => {
      expect(forwardSourceLine(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(forwardSourceLine(undefined)).toBeNull();
    });
  });

  describe("unknown type", () => {
    it("returns null for an unknown type", () => {
      expect(
        forwardSourceLine({
          type: "unknown_type",
          title: "Something",
        })
      ).toBeNull();
    });
  });

  describe("whitespace and newlines", () => {
    it("collapses multiple spaces in a title", () => {
      expect(
        forwardSourceLine({
          type: "chat",
          title: "My   Channel    Name",
        })
      ).toBe("Forwarded from My Channel Name");
    });

    it("collapses tabs and newlines", () => {
      expect(
        forwardSourceLine({
          type: "chat",
          title: "Chat\n\nWith\tNewlines",
        })
      ).toBe("Forwarded from Chat With Newlines");
    });

    it("trims leading and trailing whitespace", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: "  Bob  ",
        })
      ).toBe("Forwarded from Bob");
    });
  });

  describe("name truncation", () => {
    it("truncates names longer than 80 characters with ellipsis", () => {
      const longName = "A".repeat(85);
      const result = forwardSourceLine({
        type: "chat",
        title: longName,
      });
      expect(result).toBe(`Forwarded from ${"A".repeat(77)}…`);
      expect(result!.length).toBe("Forwarded from ".length + 77 + 1); // 1 for the ellipsis
    });

    it("does not truncate names of exactly 80 characters", () => {
      const exactName = "B".repeat(80);
      const result = forwardSourceLine({
        type: "chat",
        title: exactName,
      });
      expect(result).toBe(`Forwarded from ${"B".repeat(80)}`);
    });
  });

  describe("type coercion and robustness", () => {
    it("returns null when title is a number instead of a string", () => {
      expect(
        forwardSourceLine({
          type: "chat",
          title: 123,
        })
      ).toBeNull();
    });

    it("returns null when first_name is a number", () => {
      expect(
        forwardSourceLine({
          type: "user",
          first_name: 456,
        })
      ).toBeNull();
    });

    it("returns null for a non-object input", () => {
      expect(forwardSourceLine("not an object" as unknown as ForwardOrigin)).toBeNull();
      expect(forwardSourceLine(123 as unknown as ForwardOrigin)).toBeNull();
      expect(forwardSourceLine([] as unknown as ForwardOrigin)).toBeNull();
    });

    it("returns null when type field is not a string", () => {
      expect(
        forwardSourceLine({
          type: 123,
          title: "Channel",
        } as unknown as ForwardOrigin)
      ).toBeNull();
    });
  });

  describe("link format", () => {
    it("uses the em-dash separator in links", () => {
      const result = forwardSourceLine({
        type: "channel",
        title: "News",
        username: "news",
        message_id: 100,
      });
      expect(result).toContain(" — ");
    });
  });
});
