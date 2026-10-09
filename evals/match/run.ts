import * as fs from "node:fs";
import * as path from "node:path";
import { calculateEvidenceFit, TARGET_ROLE_TRACKS } from "../../src/lib/evidence-fit";
import type { Job } from "../../src/lib/speedrun.functions";

type GoldenEntry = {
  profile_snapshot: {
    identity: string;
    githubUrl: string;
    portfolioUrl: string;
    resumeText: string;
    targetRoles: string[];
  };
  expected_top3_ids: string[];
  note: string;
};

const FIXTURES_FILE = path.resolve(process.cwd(), "evals/match/fixtures/roles.json");
const GOLDEN_FILE = path.resolve(process.cwd(), "evals/match/golden.jsonl");

export async function runEval() {
  if (!fs.existsSync(FIXTURES_FILE)) {
    throw new Error(`Fixtures not found at ${FIXTURES_FILE}. Run record.ts first.`);
  }
  if (!fs.existsSync(GOLDEN_FILE)) {
    throw new Error(`Golden dataset not found at ${GOLDEN_FILE}.`);
  }

  const rawFixtures = fs.readFileSync(FIXTURES_FILE, "utf8");
  const fixtureJobs: Job[] = JSON.parse(rawFixtures);

  const rawGolden = fs.readFileSync(GOLDEN_FILE, "utf8");
  const goldenEntries: GoldenEntry[] = rawGolden
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  console.log("=================================================================");
  console.log("  NUVRA RECRUITER AGENT EVALUATION HARNESS — MATCH & GROUNDING  ");
  console.log("=================================================================");
  console.log(`Loaded ${fixtureJobs.length} fixture roles & ${goldenEntries.length} golden profile test cases.\n`);

  let totalExpectedTop3 = 0;
  let totalMatchedTop3 = 0;
  let totalViolations = 0;
  const detailedResults: Array<{
    caseIndex: number;
    identity: string;
    expected: string[];
    actual: string[];
    overlap: number;
    violations: number;
  }> = [];

  for (let i = 0; i < goldenEntries.length; i++) {
    const entry = goldenEntries[i];
    const profile = entry.profile_snapshot;
    const profileFacts = [
      profile.identity,
      profile.resumeText,
      `GitHub: ${profile.githubUrl}`,
      `Portfolio: ${profile.portfolioUrl}`,
    ].filter(Boolean);

    // Compute evidence fit for all fixture roles
    const scoredJobs = fixtureJobs
      .map((job) => {
        const fit = calculateEvidenceFit({
          profile,
          facts: profileFacts,
          job,
        });
        return { job, fit };
      })
      .filter(({ fit }) => fit.matchedTracks.length > 0 && fit.verdict !== "Skip")
      .sort((a, b) => b.fit.score - a.fit.score);

    const top3Actual = scoredJobs.slice(0, 3).map(({ job }) => job.id);
    const expected = entry.expected_top3_ids;

    const overlap = top3Actual.filter((id) => expected.includes(id)).length;
    totalExpectedTop3 += expected.length;
    totalMatchedTop3 += overlap;

    // Grounding verification for top candidates
    let caseViolations = 0;
    for (const candidate of scoredJobs.slice(0, 3)) {
      const { fit, job } = candidate;
      const profileSource = (
        profile.identity + " " + profile.resumeText + " " + profileFacts.join(" ")
      ).toLowerCase();
      const jobSource = (
        job.title + " " + (job.descriptionText || "") + " " + job.function
      ).toLowerCase();

      // Check 1: Must have candidate fact grounded in profile
      if (fit.profileEvidence && fit.profileEvidence !== "No direct profile evidence found") {
        const terms = fit.sharedTerms;
        const groundedInCandidate = terms.some((t) => profileSource.includes(t.toLowerCase()));
        if (!groundedInCandidate && terms.length > 0) {
          console.warn(
            `[VIOLATION] Case ${i + 1}: Un-grounded candidate claim "${fit.profileEvidence}" for ${job.id}`,
          );
          caseViolations++;
        }
      }

      // Check 2: Must have role fact grounded in job description / title
      if (fit.roleEvidence) {
        const groundedInRole =
          jobSource.includes(fit.roleEvidence.toLowerCase()) ||
          fit.sharedTerms.some((t) => jobSource.includes(t.toLowerCase()));
        if (!groundedInRole) {
          console.warn(
            `[VIOLATION] Case ${i + 1}: Un-grounded role claim "${fit.roleEvidence}" for ${job.id}`,
          );
          caseViolations++;
        }
      }
    }

    totalViolations += caseViolations;
    detailedResults.push({
      caseIndex: i + 1,
      identity: profile.identity.slice(0, 40) + "...",
      expected,
      actual: top3Actual,
      overlap,
      violations: caseViolations,
    });
  }

  // Summary Metrics
  const accuracy = ((totalMatchedTop3 / totalExpectedTop3) * 100).toFixed(1);

  console.log("-----------------------------------------------------------------");
  console.log("Case | Overlap | Violations | Profile Focus");
  console.log("-----------------------------------------------------------------");
  for (const r of detailedResults) {
    console.log(
      ` ${String(r.caseIndex).padStart(2, "0")}  |   ${r.overlap}/3   |     ${r.violations}      | ${r.identity}`,
    );
  }
  console.log("-----------------------------------------------------------------");
  console.log(`\nFinal Results:`);
  console.log(`  - Match Accuracy:       ${accuracy}% (${totalMatchedTop3}/${totalExpectedTop3} expected top-3 roles matched)`);
  console.log(`  - Grounding Violations: ${totalViolations} violations`);
  console.log(`  - Status:               ${totalViolations === 0 ? "PASSED (0 grounding violations)" : "FAILED"}\n`);

  if (totalViolations > 0) {
    process.exit(1);
  }
}

runEval().catch((err) => {
  console.error("Eval runner failed:", err);
  process.exit(1);
});
