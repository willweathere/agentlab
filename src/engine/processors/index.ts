import type { AgentRole } from '../types';
import { analyseContent, analyseWebsite } from './analyse-checks';
import { analyseDataset } from './analyse-dataset';
import { researchContent } from './research-content';
import { researchDataset } from './research-dataset';
import { researchWebsite } from './research-website';
import { review } from './review';
import { StageError, type StageProcessor } from './shared';
import { summarise } from './summarise';

const researcher: StageProcessor = {
  role: 'researcher',
  mode: 'deterministic',
  produces: 'evidence',
  run(env, ctx) {
    const { input } = env;
    const data =
      input.kind === 'dataset' ? researchDataset(input, ctx)
      : input.kind === 'website' ? researchWebsite(input, ctx)
      : researchContent(input, ctx);
    return { type: 'evidence', data };
  },
};

const analyst: StageProcessor = {
  role: 'analyst',
  mode: 'rule-based',
  produces: 'analysis',
  run(env, ctx) {
    if (!env.evidence) throw new StageError('There is no evidence set to analyse.');
    const ev = env.evidence;
    const data = ev.kind === 'dataset' ? analyseDataset(ev, ctx) : ev.kind === 'website' ? analyseWebsite(ev, ctx) : analyseContent(ev, ctx);
    return { type: 'analysis', data };
  },
};

const reviewer: StageProcessor = {
  role: 'reviewer',
  mode: 'rule-based',
  produces: 'review',
  run(env, ctx) {
    if (!env.analysis || !env.evidence) throw new StageError('There is no analysis to review.');
    return { type: 'review', data: review(env.analysis, env.evidence, env.summary, ctx) };
  },
};

const summariser: StageProcessor = {
  role: 'summariser',
  mode: 'deterministic',
  produces: 'summary',
  run(env, ctx) {
    if (!env.analysis) throw new StageError('There is no analysis to summarise.');
    return { type: 'summary', data: summarise(env.analysis, env.reviews, ctx) };
  },
};

export const PROCESSORS: Record<AgentRole, StageProcessor> = { researcher, analyst, reviewer, summariser };

export { StageError } from './shared';
