import { OpenBooklet } from '@openbooklet/sdk';

const ob = new OpenBooklet();

async function main() {
  // Fetch a skill by name
  const skill = await ob.getSkill('nextjs-seo-aeo-skill-2026');

  console.log(`Skill: ${skill.displayName}`);
  console.log(`Version: ${skill.version}`);
  console.log(`Publisher: ${skill.publisher.displayName || skill.publisher.username}`);
  console.log(`\nContent preview:\n${skill.content.slice(0, 200)}...`);
}

main().catch(console.error);
