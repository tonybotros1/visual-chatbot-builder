/**
 * The app can be served under a sub-path (for example https://host/spaghetti). Next.js adds the
 * prefix to <Link> and router navigation by itself; plain <img>/<a> tags, fetch() of public files and
 * window.location do not, so they go through these helpers.
 */
export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** An app-absolute path ("/avatars/x.svg") as the browser must request it. */
export const withBase = (appPath: string) => `${basePath}${appPath}`;

/** A browser path ("/spaghetti/bots/1") as the router expects it ("/bots/1"). */
export const stripBase = (browserPath: string) =>
  basePath && (browserPath === basePath || browserPath.startsWith(`${basePath}/`)) ? browserPath.slice(basePath.length) || "/" : browserPath;
