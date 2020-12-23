import dotenv from 'dotenv';
import fs from 'fs-extra';
import ora from 'ora';
import path from 'path';

const { argv } = process;
dotenv.config({ path: path.resolve(process.cwd(), argv[2] || '.', '.env') });
const PRISMA_CLIENT_REGEX = /provider\s*=\s*"prisma-client-js"\n\s*output\s*=\s*"(.+)"/g;

export default async function seed(
  entities: Entities,
  hide: string[] = [],
  spinner = ora()
) {
  const prismaSchema = (
    await fs.readFile(path.resolve(process.cwd(), 'schema.prisma'))
  ).toString();
  const prismaOutput = [
    ...prismaSchema.matchAll(PRISMA_CLIENT_REGEX)
  ]?.[0]?.[1];
  const outputPath = prismaOutput
    ? path.resolve(prismaOutput, 'index.js')
    : null;
  const { PrismaClient } = require(outputPath &&
    (await fs.pathExists(outputPath))
    ? outputPath
    : '@prisma/client');
  const prisma = new PrismaClient();
  const result = await Promise.all<Result>(
    Object.entries(entities).map(
      async ([key, entity]: [string, Entity | Entity[]]) => {
        spinner.start(`seeding '${key}'`);
        if (!prisma[key]) {
          spinner.warn(`failed to find '${key}'`);
          return [key, null];
        }
        if (!Array.isArray(entity)) entity = [entity];
        if (await prisma[key].count()) {
          spinner.info(`already seeded '${key}'`);
          return [key, null];
        }
        let result = await Promise.all<any[]>(
          entity.map(async (entity: Entity) => {
            try {
              const result = await prisma[key].create({ data: entity });
              return hideResults(key, result, hide);
            } catch (err) {
              spinner.fail(err);
              process.exit(1);
            }
          })
        );
        if (result.length === 1) result = result[0];
        spinner.stop();
        console.log(result);
        spinner.succeed(`seeded '${key}'`);
        return [key, result];
      }
    )
  );
  await prisma.$disconnect();
  return result.reduce((mappedResult: MappedResult, [key, value]: Result) => {
    mappedResult[key] = value;
    return mappedResult;
  }, {});
}

export function hideResults(model: string, result: Entity, hide: string[]) {
  hide = hide
    .filter((path: string) => {
      const hideArr = path.split('.');
      return (
        hideArr.length === 1 || (hideArr.length > 1 && hideArr[0] === model)
      );
    })
    .map((path: string) => {
      const hideArr = path.split('.');
      if (hideArr.length > 1 && hideArr[0] === model) {
        return hideArr.slice(1).join('.');
      }
      return path;
    });
  return {
    ...result,
    ...hide.reduce((hiddenResult: Entity, key: string) => {
      if (typeof result[key] !== 'undefined') hiddenResult[key] = '***';
      return hiddenResult;
    }, {})
  };
}

export type Result = [string, Entity[] | Entity | null];

export interface MappedResult {
  [key: string]: Entity[] | Entity | null;
}

export interface Entities {
  [key: string]: Entity | Entity[];
}

export interface Entity {
  [key: string]: any;
}
