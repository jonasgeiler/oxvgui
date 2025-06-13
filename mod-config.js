const fs = require('fs');
const path = require('path');

const RENAMED = {
  'cleanupAttrs': 'cleanupAttributes',
  'removeScriptElement': 'removeScripts',
};

const configFilePath = path.join(__dirname, './src/config.json');
const config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));

const unsortedJobs = [];
const notFoundJobs = [];
for (const job of config.jobs) {
  const plugin = config.plugins.find(plugin => (RENAMED[plugin.id] || plugin.id).toLowerCase() === job.id.toLowerCase());
  if (plugin) {
    if (job.name !== plugin.name) {
      console.warn(`Name was changed for ${job.id}: "${plugin.name}" -> "${job.name}"`);
    }

    unsortedJobs.push(job);
  } else {
    console.info(`Job is new: ${job.id} (${job.name})`);
    notFoundJobs.push(job);
  }
}

const jobs = [];
for (const plugin of config.plugins) {
  const job = unsortedJobs.find(job => job.id.toLowerCase() === (RENAMED[plugin.id] || plugin.id).toLowerCase());
  if (job) {
    jobs.push(job);
  } else {
    console.warn(`Job not found for plugin: ${plugin.id} (${plugin.name})`);
  }
}

for (const job of notFoundJobs) {
  jobs.push(job);
}

const newConfig = {
  ...config,
  jobs,
  plugins: config.plugins,
};

fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2) + '\n', 'utf8');
