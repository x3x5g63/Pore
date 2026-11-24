import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";
import type { BundledTheme } from "shiki";

const MAX_CACHE_ENTRIES = 32;
const renderCache = new Map<string, string>();

function createProcessor(shikiTheme: BundledTheme) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex, {
      throwOnError: false,
      strict: false,
    })
    .use(rehypeShiki, {
      theme: shikiTheme,
      langs: [],
      lazy: true,
      fallbackLanguage: "text",
    })
    .use(rehypeStringify);
}

const processorCache = new Map<BundledTheme, ReturnType<typeof createProcessor>>();

function getProcessor(shikiTheme: BundledTheme) {
  let proc = processorCache.get(shikiTheme);
  if (!proc) {
    proc = createProcessor(shikiTheme);
    processorCache.set(shikiTheme, proc);
  }
  return proc;
}

export async function renderMarkdown(
  source: string,
  shikiTheme: BundledTheme = "github-dark-default",
): Promise<string> {
  const cacheKey = `${shikiTheme}\0${source}`;
  const cached = renderCache.get(cacheKey);
  if (cached !== undefined) {
    renderCache.delete(cacheKey);
    renderCache.set(cacheKey, cached);
    return cached;
  }

  const file = await getProcessor(shikiTheme).process(source);
  const html = String(file);

  if (renderCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = renderCache.keys().next().value;
    if (oldestKey !== undefined) {
      renderCache.delete(oldestKey);
    }
  }
  renderCache.set(cacheKey, html);

  return html;
}
