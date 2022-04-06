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
import * as _ from 'lodash';

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
  // 'findById',
  // 'findByIdAndDelete',
  // 'findByIdAndRemove',
  // 'findByIdAndUpdate',
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
  private isDeletedField: string;
  private deletedAtField: string;
  private mongoDBVersion: string | undefined;
  private overrideOptions: OverrideOptions | {};
  private nonDeletedFilterOptions: Record<string, unknown>;
  private deleteUpdateOptions: Record<string, unknown>;
  private nonDeletedPipelineMatchOptions: PipelineStage.Match;

  constructor(options: {
    isDeletedField: string;
    deletedAtField: string;
    mongoDBVersion?: string;
    override?: OverrideOptions;
  }) {
    const { isDeletedField, deletedAtField, mongoDBVersion, override } =
      options;
    this.isDeletedField = isDeletedField;
    this.deletedAtField = deletedAtField;
    this.mongoDBVersion = mongoDBVersion;
    this.overrideOptions = override || {};
    this.nonDeletedFilterOptions = { [this.isDeletedField]: { $ne: true } };
    this.deleteUpdateOptions = {
      [this.isDeletedField]: true,
      get [this.deletedAtField]() {
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
    return JSON.stringify(filter).includes(`"${this.isDeletedField}"`);
  }

  getPlugin() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const softDelete = this;
    return (schema: Schema) => {
      const softDeleteMethods = Object.keys(
        softDeleteMapping,
      ) as SoftDeleteMappingKey[];

      softDeleteMethods.forEach(softDeleteMethod => {
        schema.statics[softDeleteMethod] = function (...args: any[]) {
          const argsClone = _.cloneDeep(args);
          const overriddenArgs = [
            Object.assign(
              softDeleteMethod === 'findByIdAndSoftDelete'
                ? { _id: argsClone[0] }
                : argsClone[0] || {},
              softDelete.nonDeletedFilterOptions,
            ),
            { $set: softDelete.deleteUpdateOptions },
            ...argsClone.slice(1),
          ];

          return Model[softDeleteMapping[softDeleteMethod]].apply(
            this,
            overriddenArgs,
          );
        };
      });

      overriddenMethods.forEach(overriddenMethod => {
        if (softDelete.overrideOptions[overriddenMethod] === false) {
          return;
        }

        schema.statics[overriddenMethod] = function (...args: any[]) {
          const argsClone = _.cloneDeep(args);
          let overriddenArgs;
          if (overriddenMethod === 'aggregate') {
            const pipelineStages: PipelineStage[] = argsClone[0] || [];
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
                      ...(stage.$lookup.pipeline || []),
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
            overriddenArgs = [pipelineStages, ...argsClone.slice(1)];
          } else if (overriddenMethod === 'bulkWrite') {
            const writes = argsClone[0];
            writes.forEach((write: Record<string, any>) => {
              const [operation] = Object.keys(write);
              if (
                ['updateOne', 'updateMany', 'replaceOne'].includes(operation)
              ) {
                const operationWrite = write[operation];
                const filter = operationWrite.filter || {};
                if (!softDelete.isIncludeSoftDeleteField(filter)) {
                  operationWrite.filter = Object.assign(
                    filter,
                    softDelete.nonDeletedFilterOptions,
                  );
                }
              }
            });
            overriddenArgs = [writes, ...argsClone.slice(1)];
          } else if (overriddenMethod === 'distinct') {
            const filter = args[1] || {};
            if (!softDelete.isIncludeSoftDeleteField(filter)) {
              Object.assign(filter, softDelete.nonDeletedFilterOptions);
            }
            overriddenArgs = [argsClone[0], filter, ...argsClone.slice(2)];
          } else {
            const filter = args[0] || {};
            if (!softDelete.isIncludeSoftDeleteField(filter)) {
              Object.assign(filter, softDelete.nonDeletedFilterOptions);
            }
            overriddenArgs = [filter, ...argsClone.slice(1)];
          }
          return Model[overriddenMethod].apply(this, overriddenArgs);
        };
      });
    };
  }
}
