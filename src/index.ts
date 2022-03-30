/* eslint-disable @typescript-eslint/ban-types */
/**
 * soft-deleted methods: softDeleteOne, softDeleteMany, findByIdAndSoftDelete
 */

import {
  FilterQuery,
  Model,
  QueryOptions,
  QueryWithHelpers,
  Schema,
  HydratedDocument,
  Callback,
  UpdateWriteOpResult,
  CallbackError,
  ModifyResult,
  Types,
  ReturnsNewDoc,
  PipelineStage,
} from 'mongoose';
import * as semver from 'semver';

export interface SoftDeleteModel<
  T,
  TQueryHelpers = {},
  TMethodsAndOverrides = {},
  TVirtuals = {},
> extends Model<T, TQueryHelpers, TMethodsAndOverrides, TVirtuals> {
  softDeleteOne<
    ResultDoc = HydratedDocument<T, TMethodsAndOverrides, TVirtuals>,
  >(
    filter?: FilterQuery<T>,
    options?: QueryOptions | null,
    callback?: Callback,
  ): QueryWithHelpers<UpdateWriteOpResult, ResultDoc, TQueryHelpers, T>;

  softDeleteMany<
    ResultDoc = HydratedDocument<T, TMethodsAndOverrides, TVirtuals>,
  >(
    filter?: FilterQuery<T>,
    options?: QueryOptions | null,
    callback?: Callback,
  ): QueryWithHelpers<UpdateWriteOpResult, ResultDoc, TQueryHelpers, T>;

  findByIdAndSoftDelete<
    ResultDoc = HydratedDocument<T, TMethodsAndOverrides, TVirtuals>,
  >(
    id: Types.ObjectId | any,
    options: QueryOptions & { rawResult: true },
    callback?: (err: CallbackError, doc: any, res: any) => void,
  ): QueryWithHelpers<ModifyResult<ResultDoc>, ResultDoc, TQueryHelpers, T>;
  findByIdAndSoftDelete<
    ResultDoc = HydratedDocument<T, TMethodsAndOverrides, TVirtuals>,
  >(
    id: Types.ObjectId | any,
    options: QueryOptions & { upsert: true } & ReturnsNewDoc,
    callback?: (err: CallbackError, doc: ResultDoc, res: any) => void,
  ): QueryWithHelpers<ResultDoc, ResultDoc, TQueryHelpers, T>;
  findByIdAndSoftDelete<
    ResultDoc = HydratedDocument<T, TMethodsAndOverrides, TVirtuals>,
  >(
    id?: Types.ObjectId | any,
    options?: QueryOptions | null,
    callback?: (err: CallbackError, doc: ResultDoc | null, res: any) => void,
  ): QueryWithHelpers<ResultDoc | null, ResultDoc, TQueryHelpers, T>;
  findByIdAndSoftDelete<
    ResultDoc = HydratedDocument<T, TMethodsAndOverrides, TVirtuals>,
  >(
    id: Types.ObjectId | any,
    callback: (err: CallbackError, doc: ResultDoc | null, res: any) => void,
  ): QueryWithHelpers<ResultDoc | null, ResultDoc, TQueryHelpers, T>;
}

const softDeleteMapping = {
  softDeleteOne: 'updateOne',
  softDeleteMany: 'updateMany',
  findByIdAndSoftDelete: 'findByIdAndUpdate',
} as const;
type SoftDeleteMapping = typeof softDeleteMapping;
type SoftDeleteMappingKey = keyof SoftDeleteMapping;

const overriddenMethods = [
  'aggregate',
  // 'bulkSave',
  'bulkWrite',
  'count',
  'countDocuments',
  // 'create',
  // 'deleteMany',
  // 'deleteOne',
  'distinct',
  'exists',
  'find',
  'findById',
  // 'findByIdAndDelete',
  // 'findByIdAndRemove',
  'findByIdAndUpdate',
  'findOne',
  // 'findOneAndDelete',
  // 'findOneAndRemove',
  'findOneAndReplace',
  'findOneAndUpdate',
  // 'insertMany',
  // 'deleteOne',
  // 'remove',
  // 'save',
  // 'remove',
  'replaceOne',
  'update',
  'updateMany',
  'updateOne',
] as const;
type OverriddenMethod = typeof overriddenMethods[number];

type OverrideOptions = Record<OverriddenMethod, boolean>;

export class SoftDelete {
  private mongoDBVersion: string | undefined;
  private softDeleteField: string;
  private overrideOptions: OverrideOptions | undefined;
  private nonDeletedFilterOptions: Record<string, null>;
  private deleteUpdateOptions: Record<string, Date>;
  private nonDeletedPipelineMatchOptions: PipelineStage.Match;

  constructor(
    softDeleteField: string,
    options: { mongoDBVersion?: string; override?: OverrideOptions } = {},
  ) {
    const { mongoDBVersion, override } = options;
    this.mongoDBVersion = mongoDBVersion;
    this.softDeleteField = softDeleteField;
    this.overrideOptions = override;
    this.nonDeletedFilterOptions = { [this.softDeleteField]: null };
    this.deleteUpdateOptions = {
      get [this.softDeleteField]() {
        return new Date();
      },
    };
    this.nonDeletedPipelineMatchOptions = {
      $match: this.nonDeletedFilterOptions,
    };
  }

  private isLookupStage(stage: PipelineStage): stage is PipelineStage.Lookup {
    return (stage as Record<string, any>).$lookup ? true : false;
  }

  private isGraphLookupStage(
    stage: PipelineStage,
  ): stage is PipelineStage.GraphLookup {
    return (stage as Record<string, any>).$graphLookup ? true : false;
  }

  private isIncludeSoftDeleteField(
    filter: FilterQuery<Record<string, any>> | PipelineStage[],
  ) {
    return JSON.stringify(filter).includes(`"${this.softDeleteField}"`);
  }

  getPlugin() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const softDelete = this;
    return (schema: Schema) => {
      const softDeleteMethods = Object.keys(
        softDeleteMapping,
      ) as SoftDeleteMappingKey[];

      softDeleteMethods.forEach(softDeleteMethod => {
        schema.statics[softDeleteMethod] = async function (
          this,
          ...args: any[]
        ) {
          const softDeleteToUpdateArgs = [
            Object.assign(args[0] || {}, softDelete.nonDeletedFilterOptions),
            { $set: softDelete.deleteUpdateOptions },
            ...args.slice(1, args.length),
          ];

          return (this[softDeleteMapping[softDeleteMethod]] as Function)(
            ...softDeleteToUpdateArgs,
          );
        };
      });

      overriddenMethods.forEach(overriddenMethod => {
        if (
          softDelete.overrideOptions &&
          !softDelete.overrideOptions[overriddenMethod]
        ) {
          return;
        }

        schema.statics[overriddenMethod] = async function (
          this,
          ...args: any[]
        ) {
          if (overriddenMethod === 'aggregate') {
            const pipelineStages: PipelineStage[] = args[0] || [];
            if (!softDelete.isIncludeSoftDeleteField(pipelineStages)) {
              pipelineStages.unshift(softDelete.nonDeletedPipelineMatchOptions);
            }

            pipelineStages.forEach(stage => {
              if (softDelete.isLookupStage(stage)) {
                if (stage.$lookup.pipeline) {
                  stage.$lookup.pipeline.unshift(
                    softDelete.nonDeletedPipelineMatchOptions,
                  );
                } else {
                  if (
                    !softDelete.mongoDBVersion ||
                    semver.gt(softDelete.mongoDBVersion, '5.0.0')
                  ) {
                    stage.$lookup.pipeline = [
                      softDelete.nonDeletedPipelineMatchOptions,
                    ];
                  } else {
                    const letField = 'localField';
                    stage.$lookup = {
                      from: stage.$lookup.from,
                      let: { [letField]: `$${stage.$lookup.localField}` },
                      pipeline: [
                        softDelete.nonDeletedPipelineMatchOptions,
                        {
                          $match: {
                            $expr: {
                              $eq: [
                                `$$${letField}`,
                                `$${stage.$lookup.foreignField}`,
                              ],
                            },
                          },
                        },
                      ],
                      as: stage.$lookup.as,
                    };
                  }
                }
              } else if (softDelete.isGraphLookupStage(stage)) {
                stage.$graphLookup.restrictSearchWithMatch = Object.assign(
                  stage.$graphLookup.restrictSearchWithMatch || {},
                  softDelete.nonDeletedFilterOptions,
                );
              }
            });
          } else if (overriddenMethod === 'bulkWrite') {
            const writes = args[0];
            writes.forEach((write: Record<string, any>) => {
              const [operation] = Object.keys(write);
              if (
                ['updateOne', 'updateMany', 'replaceOne'].includes(operation)
              ) {
                const filter = write.filter || {};
                if (softDelete.isIncludeSoftDeleteField(filter)) {
                  Object.assign(filter, softDelete.nonDeletedFilterOptions);
                }
              }
            });
          } else if (overriddenMethod === 'distinct') {
            const filter = args[1] || {};
            if (!softDelete.isIncludeSoftDeleteField(filter)) {
              args[1] = Object.assign(
                filter,
                softDelete.nonDeletedFilterOptions,
              );
            }
          } else {
            const filter = args[0] || {};
            if (!softDelete.isIncludeSoftDeleteField(filter)) {
              args[0] = Object.assign(
                filter,
                softDelete.nonDeletedFilterOptions,
              );
            }
          }
          return Model[overriddenMethod].apply(this, args);
        };
      });
    };
  }
}
