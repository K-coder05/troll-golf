import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { CourseConversionError, convertCourse, type TiledMap } from "@troll-golf/shared";

const USAGE = `Usage: npm run convert-course -- --id <course-id> --name "<Course Name>" [--out <file.json>] <hole1.tmj> [hole2.tmj ...]

Holes are played in the order the files are listed. Without --out the course JSON goes to stdout.`;

/** npm runs workspace scripts from the package dir; paths the user typed are relative to where they ran npm. */
const base = process.env.INIT_CWD ?? process.cwd();
const abs = (p: string) => resolve(base, p);

function main(argv: string[]): number {
  let id = "";
  let name = "";
  let out = "";
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--id") id = argv[++i] ?? "";
    else if (a === "--name") name = argv[++i] ?? "";
    else if (a === "--out") out = argv[++i] ?? "";
    else if (a === "--help" || a === "-h") {
      console.log(USAGE);
      return 0;
    } else files.push(a);
  }
  if (!id || !name || files.length === 0) {
    console.error(USAGE);
    return 2;
  }
  try {
    const sources = files.map((file) => {
      const map = JSON.parse(readFileSync(abs(file), "utf8")) as TiledMap;
      return { name: basename(file, extname(file)), map };
    });
    const json = JSON.stringify(convertCourse({ id, name }, sources), null, 2) + "\n";
    if (out) {
      mkdirSync(dirname(abs(out)), { recursive: true });
      writeFileSync(abs(out), json);
      console.error(`Wrote ${out} (${sources.length} Hole${sources.length === 1 ? "" : "s"})`);
    } else process.stdout.write(json);
    return 0;
  } catch (e) {
    if (e instanceof CourseConversionError) {
      console.error(`Course conversion failed with ${e.errors.length} problem(s):`);
      for (const msg of e.errors) console.error(`  - ${msg}`);
    } else console.error(e instanceof Error ? e.message : e);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
