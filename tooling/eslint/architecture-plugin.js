// Local ESLint plugin enforcing the modular-monolith rules of ARCHITECTURE.md §4:
//  1. module-boundaries: a file in modules/<A>/ may import another module <B>
//     only through modules/<B>/index.(ts|js).
//  2. models-only-in-repositories: Mongoose models (modules/<A>/models/**) may be
//     imported only by files in modules/<A>/repositories/** or modules/<A>/models/**
//     (ADR-007: all queries go through scoped repositories).
import path from 'node:path';

const MODULE_RE = /^(.*\/src\/modules)\/([^/]+)\/(.*)$/;

function locate(file) {
  const match = MODULE_RE.exec(file.split(path.sep).join('/'));
  if (!match) return null;
  const [, root, name, rest] = match;
  return { root, name, rest };
}

function importSources(context, check) {
  const visit = (node) => {
    if (node.source && typeof node.source.value === 'string') check(node, node.source.value);
  };
  return {
    ImportDeclaration: visit,
    ExportNamedDeclaration: visit,
    ExportAllDeclaration: visit,
    ImportExpression: visit,
  };
}

function resolveTarget(context, spec) {
  if (!spec.startsWith('.')) return null; // packages / aliases are not module internals
  const from = context.filename ?? context.getFilename();
  return locate(path.resolve(path.dirname(from), spec));
}

const moduleBoundaries = {
  meta: {
    type: 'problem',
    docs: { description: 'Cross-module imports must go through the target module index' },
    messages: {
      internal:
        'Module "{{from}}" must not import internals of module "{{to}}". Import from "modules/{{to}}/index" instead.',
    },
    schema: [],
  },
  create(context) {
    const self = locate(context.filename ?? context.getFilename());
    if (!self) return {};
    return importSources(context, (node, spec) => {
      const target = resolveTarget(context, spec);
      if (!target || target.root !== self.root || target.name === self.name) return;
      if (!/^index(\.(ts|js))?$/.test(target.rest)) {
        context.report({ node, messageId: 'internal', data: { from: self.name, to: target.name } });
      }
    });
  },
};

const modelsOnlyInRepositories = {
  meta: {
    type: 'problem',
    docs: { description: 'Mongoose models may only be used from repositories (ADR-007)' },
    messages: {
      model:
        'Import models only from "repositories/" so every query is scope-filtered (ADR-007). Use the module repository instead.',
    },
    schema: [],
  },
  create(context) {
    const self = locate(context.filename ?? context.getFilename());
    if (!self) return {};
    const allowed = /^(repositories|models)\//.test(self.rest);
    return importSources(context, (node, spec) => {
      const target = resolveTarget(context, spec);
      if (!target || !target.rest.startsWith('models/')) return;
      if (!allowed || target.name !== self.name) {
        context.report({ node, messageId: 'model' });
      }
    });
  },
};

export default {
  meta: { name: 'snapshare-architecture' },
  rules: {
    'module-boundaries': moduleBoundaries,
    'models-only-in-repositories': modelsOnlyInRepositories,
  },
};
