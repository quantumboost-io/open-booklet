import { OpenBooklet } from '@openbooklet/sdk';

const ob = new OpenBooklet();

async function main() {
  // Search for skills
  const results = await ob.searchSkills('code review');

  console.log(`Found ${results.results.length} skills:`);
  for (const skill of results.results.slice(0, 5)) {
    console.log(`  - ${skill.name} (${skill.publisher})`);
  }

  // Get trending
  const trending = await ob.getTrending({ limit: 5 });
  console.log('\nTrending this week:');
  for (const item of trending.trending) {
    console.log(`  - ${item.name} (${item.weeklyPulls} pulls)`);
  }
}

main().catch(console.error);
