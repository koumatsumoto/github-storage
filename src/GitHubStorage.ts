import { map, pipe, take } from "remeda";
import { GitHubClient } from "./GitHubClient";
import { FileIndex } from "./types";
import { createFileData, getFilePath, makeCommitMessage, parseCommitMessage, parseFileData, toBase64 } from "./utils";

// @see https://docs.github.com/en/graphql/overview/resource-limitations
const MAX_NODE_COUNT = 100;

export class GitHubStorage {
  readonly #client: GitHubClient;
  readonly #owner: string;
  readonly #repository: string;
  #defaultBranch?: string;

  constructor({ token, repository }: { token: string; repository: string }) {
    this.#client = new GitHubClient({ token });
    const [owner, repo] = repository.split("/");
    if (!owner || !repo) {
      throw new Error("Invalid repository name");
    }
    this.#owner = owner;
    this.#repository = repo;
  }

  async userinfo() {
    return this.#client.getViewer();
  }

  async defaultBranch(): Promise<string> {
    if (this.#defaultBranch) {
      return this.#defaultBranch;
    }

    return (
      this.#defaultBranch = await this.#client.getRepositoryDefaultBranch({
        owner: this.#owner,
        name: this.#repository,
      })
    );
  }

  async findIndices({ count }: { count: number }): Promise<FileIndex[]> {
    const results: string[] = [];
    let endCursor: string | undefined = undefined;
    let hasNextPage = true;
    while (hasNextPage && results.length < count) {
      const result: Awaited<ReturnType<GitHubClient["getRepositoryCommits"]>> = await this.#client.getRepositoryCommits(
        {
          owner: this.#owner,
          name: this.#repository,
          count: Math.min(MAX_NODE_COUNT, count),
          after: endCursor,
        },
      );

      endCursor = result.endCursor;
      hasNextPage = result.hasNextPage;
      results.push(...result.commits.map(({ message }) => message));
    }

    return pipe(results, take(count), map(parseCommitMessage));
  }

  async loadFile(id: number) {
    const filepath = getFilePath(id);
    const defaultBranchName = await this.defaultBranch();

    const file = await this.#client.getRepositoryFile({
      owner: this.#owner,
      name: this.#repository,
      expression: `${defaultBranchName}:${filepath}`,
    });

    if (!file) {
      console.error(`[github-storage] file not found: ${filepath}`);
      return undefined;
    }

    try {
      return parseFileData(file.text);
    } catch {
      console.error(`[github-storage] data is not json schema: ${file.text}`);
      return undefined;
    }
  }

  async save(
    { title = "", text = "", tags = [], time = new Date() }: {
      title?: string;
      text?: string;
      tags?: string[];
      time?: Date;
    },
  ) {
    const { defaultBranchName, lastCommitId } = await this.#client.getRepositoryCommits({
      owner: this.#owner,
      name: this.#repository,
      count: 1,
    });

    const filepath = getFilePath(time);
    const filedata = createFileData({ time, title, text, tags });
    const commitMessage = makeCommitMessage({ time, title, tags });

    return await this.#client.createCommit({
      input: {
        branch: {
          repositoryNameWithOwner: `${this.#owner}/${this.#repository}`,
          branchName: defaultBranchName,
        },
        expectedHeadOid: lastCommitId,
        fileChanges: {
          additions: [{ path: filepath, contents: toBase64(filedata) }],
        },
        message: {
          headline: commitMessage,
        },
      },
    });
  }
}
