/**
 * One `apply` operation run on a mutator: the library call the operation
 * stands for, and the lines `apply` prints for it.  Shared by `apply` and
 * the single-operation commands, so both pass the same calls and print the
 * same lines.
 */
import type { CascadedReference, LikeC4Mutator } from '../mutator/mutator.js';
import { deploymentRelationshipSelector, type Mutation } from '../mutations-file.js';

/** What {@link runOperation} did. */
export interface OperationOutcome {
  /** The library method's return value; `null` when it returns nothing */
  result: unknown;
  /** The lines `apply` prints for the operation, without line ends; often none */
  lines: string[];
}

function assertNever(x: never): never {
  throw new Error(`Unhandled mutation op: ${(x as { op: string }).op}`);
}

/** A result line naming what a removal removed, with the count of relationships it took along. */
function removedLine(op: Mutation['op'], what: string, relationships: number): string {
  return `  ${op}: removed ${what}${relationships > 0 ? ` (${relationships} relationship(s) also removed)` : ''}`;
}

/** A result line listing the references a cascade removed, `file:line:column (role)` at their pre-write positions. */
function cascadedLines(op: Mutation['op'], cascaded: CascadedReference[] | undefined): string[] {
  if (!cascaded || cascaded.length === 0) return [];
  const list = cascaded.map((ref) => `${ref.file}:${ref.line}:${ref.column} (${ref.role})`).join(', ');
  return [`  ${op}: cascade removed ${list}`];
}

/** A result line naming the `par` blocks a step move or removal emptied (pre-write paths). */
function removedBlocksLines(op: Mutation['op'], paths: number[][]): string[] {
  if (paths.length === 0) return [];
  return [`  ${op}: removed the emptied par block(s) ${paths.map((p) => JSON.stringify(p)).join(', ')}`];
}

/**
 * Run `mutation` on `mutator` with the library call `apply` makes for it.
 * The mutation is expected to have passed `validateMutation`.  Errors of the
 * library call (an `InvalidWriteError` among them) propagate unchanged.
 */
export function runOperation(mutator: LikeC4Mutator, mutation: Mutation): OperationOutcome {
  const done = (result: unknown, lines: string[] = []): OperationOutcome => ({
    result: result === undefined ? null : result,
    lines,
  });
  switch (mutation.op) {
    case 'addElement': {
      const m = mutation;
      const createdFqn = mutator.addElement(m.parent ?? null, {
        name: m.id,
        kind: m.kind,
        title: m.title,
        file: m.file,
        summary: m.summary,
        description: m.description,
        technology: m.technology,
        tags: m.tags,
        links: m.links,
        style: m.style,
        metadata: m.metadata,
      });
      return done(createdFqn, [`  addElement: created '${createdFqn}'`]);
    }
    case 'addRelationship': {
      const m = mutation;
      return done(
        mutator.addRelationship(m.source, m.target, m.label, {
          description: m.description,
          technology: m.technology,
          tags: m.tags,
          links: m.links,
          metadata: m.metadata,
          style: m.style,
          ...(m.kind !== undefined && { kind: m.kind }),
          ...(m.kindForm !== undefined && { kindForm: m.kindForm }),
          ...(m.bidirectional !== undefined && { bidirectional: m.bidirectional }),
          ...(m.placement !== undefined && { placement: m.placement }),
          ...(m.file !== undefined && { file: m.file }),
          ...(m.shared !== undefined && { shared: m.shared }),
        }),
      );
    }
    case 'addView': {
      const m = mutation;
      return done(
        mutator.addView({
          id: m.id,
          type: m.type,
          target: m.target,
          title: m.title,
          includes: m.includes,
          ...(m.autoLayout !== undefined && { autoLayout: m.autoLayout }),
          ...(m.description !== undefined && { description: m.description }),
          ...(m.extends !== undefined && { extends: m.extends }),
          ...(m.file !== undefined && { file: m.file }),
        }),
      );
    }
    case 'updateView': {
      const { op: _op, id, ...patch } = mutation;
      return done(mutator.updateView(id, patch));
    }
    case 'addViewRule': {
      const m = mutation;
      return done(mutator.addViewRule(m.id, m.rule, m.before !== undefined ? { before: m.before } : {}));
    }
    case 'replaceViewRule': {
      const m = mutation;
      return done(mutator.replaceViewRule(m.id, m.address, m.rule));
    }
    case 'removeViewRule': {
      const m = mutation;
      return done(mutator.removeViewRule(m.id, m.address));
    }
    case 'removeView': {
      const m = mutation;
      const result = mutator.removeView(m.id, { cascade: m.cascade === true });
      return done(result, [`  removeView: removed '${m.id}'`, ...cascadedLines(m.op, result.cascaded)]);
    }
    case 'addViewStep': {
      const m = mutation;
      return done(mutator.addViewStep(m.id, m.step, m.path !== undefined ? { path: m.path } : {}));
    }
    case 'updateViewStep': {
      const m = mutation;
      return done(mutator.updateViewStep(m.id, m.address, m.patch));
    }
    case 'moveViewStep': {
      const m = mutation;
      const result = mutator.moveViewStep(m.id, m.from, m.to);
      return done(result, removedBlocksLines(m.op, result.removedParallelBlocks));
    }
    case 'removeViewStep': {
      const m = mutation;
      const result = mutator.removeViewStep(m.id, m.address);
      return done(result, removedBlocksLines(m.op, result.removedParallelBlocks));
    }
    case 'addViewParallel': {
      const m = mutation;
      return done(
        mutator.addViewParallel(m.id, {
          ...(m.path !== undefined && { path: m.path }),
          ...(m.statements !== undefined && { statements: m.statements }),
          ...(m.steps !== undefined && { steps: m.steps }),
        }),
      );
    }
    case 'updateElement': {
      const m = mutation;
      return done(
        mutator.updateElement(m.fqn, {
          title: m.title,
          summary: m.summary,
          description: m.description,
          technology: m.technology,
          tags: m.tags,
          links: m.links,
          style: m.style,
          metadata: m.metadata,
        }),
      );
    }
    case 'removeElement': {
      const m = mutation;
      const result = mutator.removeElement(m.fqn, { cascade: m.cascade === true });
      return done(result, [
        removedLine(m.op, `'${m.fqn}'`, result.removedRelationships.length),
        ...cascadedLines(m.op, result.cascaded),
      ]);
    }
    case 'addElementExtend': {
      const { op: _op, fqn, ...opts } = mutation;
      const result = mutator.addElementExtend(fqn, opts);
      return done(result, [
        `  addElementExtend: ${result.merged ? 'merged into the extend block' : 'added an extend block'} of '${fqn}' in '${opts.file}'`,
      ]);
    }
    case 'addRelationshipExtend': {
      const { op: _op, source, target, matchKind, matchTitle, matchBidirectional, position, ...opts } = mutation;
      const result = mutator.addRelationshipExtend(
        {
          source,
          target,
          ...(matchKind !== undefined && { matchKind }),
          ...(matchTitle !== undefined && { matchTitle }),
          ...(matchBidirectional !== undefined && { matchBidirectional }),
          ...(position !== undefined && { position }),
        },
        opts,
      );
      return done(result, [
        `  addRelationshipExtend: ${result.merged ? 'merged into the extend block' : 'added an extend block'} of '${source}' -> '${target}' in '${opts.file}'`,
      ]);
    }
    case 'addKind': {
      const { op: _op, type, name, ...opts } = mutation;
      return done(mutator.addKind(type, name, opts), [`  addKind: declared the ${type} kind '${name}'`]);
    }
    case 'updateKind': {
      const { op: _op, type, name, ...patch } = mutation;
      return done(mutator.updateKind(type, name, patch), [`  updateKind: changed the ${type} kind '${name}'`]);
    }
    case 'addTag': {
      const m = mutation;
      return done(mutator.addTag(m.name, m.file !== undefined ? { file: m.file } : {}), [`  addTag: declared the tag '${m.name}'`]);
    }
    case 'renameKind': {
      const m = mutation;
      return done(mutator.renameKind(m.type, m.name, m.newName), [
        `  renameKind: renamed the ${m.type} kind '${m.name}' to '${m.newName}'`,
      ]);
    }
    case 'removeKind': {
      const m = mutation;
      return done(mutator.removeKind(m.type, m.name), [`  removeKind: removed the ${m.type} kind '${m.name}'`]);
    }
    case 'renameTag': {
      const m = mutation;
      return done(mutator.renameTag(m.name, m.newName), [`  renameTag: renamed the tag '${m.name}' to '${m.newName}'`]);
    }
    case 'removeTag': {
      const m = mutation;
      return done(mutator.removeTag(m.name), [`  removeTag: removed the tag '${m.name}'`]);
    }
    case 'renameElement': {
      const m = mutation;
      const result = mutator.renameElement(m.fqn, m.newName);
      return done(result, [`  renameElement: renamed '${m.fqn}' to '${result.fqn}'`]);
    }
    case 'moveElement': {
      const m = mutation;
      const result = mutator.moveElement(m.fqn, { parent: m.parent, ...(m.file !== undefined && { file: m.file }) });
      return done(result, [`  moveElement: moved '${m.fqn}' to '${result.fqn}'`]);
    }
    case 'removeRelationship': {
      const m = mutation;
      return done(
        mutator.removeRelationship({
          source: m.source,
          target: m.target,
          matchKind: m.matchKind,
          matchTitle: m.matchTitle,
          matchBidirectional: m.matchBidirectional,
          position: m.position,
        }),
      );
    }
    case 'updateRelationship': {
      const m = mutation;
      return done(
        mutator.updateRelationship(
          {
            source: m.source,
            target: m.target,
            matchKind: m.matchKind,
            matchTitle: m.matchTitle,
            matchBidirectional: m.matchBidirectional,
            position: m.position,
          },
          {
            label: m.label,
            description: m.description,
            technology: m.technology,
            tags: m.tags,
            links: m.links,
            metadata: m.metadata,
            style: m.style,
          },
        ),
      );
    }
    case 'addDeploymentNode': {
      const m = mutation;
      const createdId = mutator.addDeploymentNode(m.parent ?? null, {
        name: m.name,
        kind: m.kind,
        title: m.title,
        summary: m.summary,
        description: m.description,
        technology: m.technology,
        tags: m.tags,
        links: m.links,
        style: m.style,
        metadata: m.metadata,
        file: m.file,
      });
      return done(createdId, [`  addDeploymentNode: created '${createdId}'`]);
    }
    case 'updateDeploymentNode':
    case 'updateDeploymentInstance': {
      const m = mutation;
      const patch = {
        title: m.title,
        summary: m.summary,
        description: m.description,
        technology: m.technology,
        tags: m.tags,
        links: m.links,
        style: m.style,
        metadata: m.metadata,
      };
      return done(
        m.op === 'updateDeploymentNode' ? mutator.updateDeploymentNode(m.id, patch) : mutator.updateDeploymentInstance(m.id, patch),
      );
    }
    case 'removeDeploymentNode':
    case 'removeDeploymentInstance': {
      const m = mutation;
      const options = { cascade: m.cascade === true };
      const result =
        m.op === 'removeDeploymentNode' ? mutator.removeDeploymentNode(m.id, options) : mutator.removeDeploymentInstance(m.id, options);
      return done(result, [
        removedLine(m.op, `'${m.id}'`, result.removedRelationships.length),
        ...cascadedLines(m.op, result.cascaded),
      ]);
    }
    case 'addDeploymentInstance': {
      const m = mutation;
      const createdId = mutator.addDeploymentInstance(m.node, {
        element: m.element,
        name: m.name,
        title: m.title,
        summary: m.summary,
        description: m.description,
        technology: m.technology,
        tags: m.tags,
        links: m.links,
        style: m.style,
        metadata: m.metadata,
      });
      return done(createdId, [`  addDeploymentInstance: created '${createdId}'`]);
    }
    case 'addDeploymentRelationship': {
      const m = mutation;
      return done(
        mutator.addDeploymentRelationship(m.source, m.target, {
          kind: m.kind,
          bidirectional: m.bidirectional,
          title: m.title,
          description: m.description,
          technology: m.technology,
          tags: m.tags,
          links: m.links,
          metadata: m.metadata,
          style: m.style,
          file: m.file,
        }),
      );
    }
    case 'updateDeploymentRelationship': {
      const m = mutation;
      return done(
        mutator.updateDeploymentRelationship(deploymentRelationshipSelector(m), {
          title: m.title,
          description: m.description,
          technology: m.technology,
          tags: m.tags,
          links: m.links,
          metadata: m.metadata,
          style: m.style,
        }),
      );
    }
    case 'removeDeploymentRelationship': {
      const m = mutation;
      return done(mutator.removeDeploymentRelationship(deploymentRelationshipSelector(m)));
    }
    case 'addDeploymentExtend': {
      const m = mutation;
      return done(mutator.addDeploymentExtend(m.node, { file: m.file, tags: m.tags, links: m.links, metadata: m.metadata }));
    }
    case 'removeDeploymentExtend': {
      const m = mutation;
      const result = mutator.removeDeploymentExtend({ node: m.node, file: m.file, occurrence: m.occurrence });
      return done(result, [removedLine(m.op, `'extend ${m.node}' in '${m.file}'`, result.removedRelationships.length)]);
    }
    default:
      return assertNever(mutation);
  }
}
