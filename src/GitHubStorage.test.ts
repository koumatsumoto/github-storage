import { GitHubStorage } from "./GitHubStorage";
import { expect, test, describe } from "vitest";

describe("GitHubStorage", () => {
  const storage = new GitHubStorage({
    token: process.env.GITHUB_TOKEN ?? "",
    repository: "koumatsumoto/github-storage-test",
  });

  test("userinfo", async () => {
    const data = await storage.userinfo();

    expect(data).toStrictEqual({
      name: "kou",
      username: "koumatsumoto",
      avatarUrl: expect.any(String),
    });
  });

  test("save", async () => {
    const data = await storage.save({ title: "title", text: "hello", tags: ["tag1", "tag2"] });

    expect(data).toStrictEqual({
      lastCommitId: expect.any(String),
    });
  });

  test("loadFile", async () => {
    const data = await storage.loadFile(1660137981949);

    expect(data).toStrictEqual({
      time: 1660137981949,
      title: "title",
      text: "hello",
      tags: ["tag1", "tag2"],
    });
  });

  test("findIndices", async () => {
    const data = await storage.findIndices({ count: 2 });

    expect(data).toBeInstanceOf(Array);
  });
});
