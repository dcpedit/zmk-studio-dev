import fs from "fs/promises";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.resolve(__filename, "../..");

// Repository whose latest GitHub Release feeds the download page.
// GitHub Actions sets GITHUB_REPOSITORY automatically; RELEASE_REPO overrides it.
const RELEASE_REPO =
  process.env.RELEASE_REPO ||
  process.env.GITHUB_REPOSITORY ||
  "dcpedit/zmk-studio-dev";

// Written when there is no published release yet (or the API is unreachable)
// so the build still succeeds and the download page degrades gracefully.
const EMPTY_RELEASE = {
  tag_name: "",
  html_url: `https://github.com/${RELEASE_REPO}/releases`,
  assets: [],
};

async function fetchLatestRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`,
    {
      headers: process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {},
    },
  );
  if (response.status === 404) {
    console.warn(
      `No published release found for ${RELEASE_REPO}; download page will have no links.`,
    );
    return EMPTY_RELEASE;
  }
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

async function generateReleaseData() {
  let data;
  try {
    data = await fetchLatestRelease();
  } catch (error) {
    console.warn(
      `Could not fetch release data for ${RELEASE_REPO}, using empty release:`,
      error.message ?? error,
    );
    data = EMPTY_RELEASE;
  }

  const dataFilePath = path.resolve(
    __dirname,
    "src",
    "data",
    "release-data.json",
  );
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
  await fs.writeFile(dataFilePath, JSON.stringify(data));

  console.log(`Release data generated for ${RELEASE_REPO}.`);
}

generateReleaseData();
