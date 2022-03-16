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
  'findByIdAndDelete',
  'findByIdAndRemove',
  'findByIdAndUpdate',
  'findOne',
  'findOneAndDelete',
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

type OverrideOption = Record<OverriddenMethod, boolean>;

export class SoftDelete {
  private mongoDBVersion: string | undefined;
  private softDeleteField: string;
  private overrideOptions: OverrideOption | undefined;
  private nonDeletedFilterOptions: Record<string, null>;
  private deleteUpdateOptions: Record<string, Date>;
  private nonDeletedPipelineMatchOptions: PipelineStage.Match;

  constructor(
    softDeleteField: string,
    options: { mongoDBVersion?: string; override?: OverrideOption } = {},
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

  private isPipelineStageMatch(
    object: Record<string, any>,
  ): object is PipelineStage.Match {
    return object.$match ? true : false;
  }

  private isPipelineStageLookup(
    object: Record<string, any>,
  ): object is PipelineStage.Lookup {
    return object.$lookup ? true : false;
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
            const pipelines: PipelineStage[] = args[0] || [];
            if (
              pipelines.some(pipeline => {
                if (
                  softDelete.isPipelineStageMatch(pipeline) &&
                  pipeline?.$match?.[softDelete.softDeleteField]
                ) {
                  return true;
                }
                return false;
              })
            ) {
              pipelines.unshift(softDelete.nonDeletedPipelineMatchOptions);
            }

            pipelines.forEach(pipeline => {
              if (softDelete.isPipelineStageLookup(pipeline)) {
                if (pipeline.$lookup.pipeline) {
                  pipeline.$lookup.pipeline.unshift(
                    softDelete.nonDeletedPipelineMatchOptions,
                  );
                } else {
                  if (
                    !softDelete.mongoDBVersion ||
                    softDelete.mongoDBVersion >= '5'
                  ) {
                    pipeline.$lookup.pipeline = [
                      softDelete.nonDeletedPipelineMatchOptions,
                    ];
                  } else {
                    if (softDelete.mongoDBVersion < '3.6') {
                      throw new Error(
                        'Mongodb server version smaller than 3.6 does not support aggregate lookup pipeline overrides',
                      );
                    }

                    if (softDelete.mongoDBVersion < '5') {
                      const letField = 'localField';
                      pipeline.$lookup = {
                        from: pipeline.$lookup.from,
                        let: { [letField]: `$${pipeline.$lookup.localField}` },
                        pipeline: [
                          softDelete.nonDeletedPipelineMatchOptions,
                          {
                            $match: {
                              $expr: {
                                $eq: [
                                  `$$${letField}`,
                                  `$${pipeline.$lookup.foreignField}`,
                                ],
                              },
                            },
                          },
                        ],
                        as: pipeline.$lookup.as,
                      };
                    }
                  }
                }
              }
            });
          } else if (overriddenMethod === 'bulkWrite') {
            const writes = args[0];
            writes.forEach((write: Record<string, any>) => {
              const [operation] = Object.keys(write);
              if (
                ['updateOne', 'updateMany', 'replaceOne'].includes(operation)
              ) {
                if (!write.filter?.[softDelete.softDeleteField]) {
                  Object.assign(
                    write.filter || {},
                    softDelete.nonDeletedFilterOptions,
                  );
                }
              }
            });
          } else if (overriddenMethod === 'distinct') {
            if (!args[1]?.[softDelete.softDeleteField]) {
              args[1] = Object.assign(
                args[1] || {},
                softDelete.nonDeletedFilterOptions,
              );
            }
          } else {
            if (!args[0]?.[softDelete.softDeleteField]) {
              args[0] = Object.assign(
                args[0] || {},
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
