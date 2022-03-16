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

export interface SoftDeletedModel<
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

const softDeletedMapping = {
  softDeleteOne: 'updateOne',
  softDeleteMany: 'updateMany',
  findByIdAndSoftDelete: 'findByIdAndUpdate',
} as const;
type SoftDeletedMapping = typeof softDeletedMapping;
type SoftDeletedMappingKey = keyof SoftDeletedMapping;

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

export class SoftDeleted {
  private mongoDBVersion: string | undefined;
  private softDeletedField: string;
  private overrideOptions: OverrideOption | undefined;
  private nonDeletedFilterOptions: Record<string, null>;
  private deleteUpdateOptions: Record<string, Date>;
  private nonDeletedPipelineMatchOptions: PipelineStage.Match;

  constructor(
    softDeletedField: string,
    options: { mongoDBVersion?: string; override?: OverrideOption } = {},
  ) {
    const { mongoDBVersion, override } = options;
    this.mongoDBVersion = mongoDBVersion;
    this.softDeletedField = softDeletedField;
    this.overrideOptions = override;
    this.nonDeletedFilterOptions = { [this.softDeletedField]: null };
    this.deleteUpdateOptions = {
      get [this.softDeletedField]() {
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
    const softDeleted = this;
    return (schema: Schema) => {
      const softDeletedMethods = Object.keys(
        softDeletedMapping,
      ) as SoftDeletedMappingKey[];

      softDeletedMethods.forEach(softDeletedMethod => {
        schema.statics[softDeletedMethod] = async function (
          this,
          ...args: any[]
        ) {
          const softDeleteToUpdateArgs = [
            Object.assign(args[0] || {}, softDeleted.nonDeletedFilterOptions),
            { $set: softDeleted.deleteUpdateOptions },
            ...args.slice(1, args.length),
          ];

          return (this[softDeletedMapping[softDeletedMethod]] as Function)(
            ...softDeleteToUpdateArgs,
          );
        };
      });

      overriddenMethods.forEach(overriddenMethod => {
        if (
          softDeleted.overrideOptions &&
          !softDeleted.overrideOptions[overriddenMethod]
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
                  softDeleted.isPipelineStageMatch(pipeline) &&
                  pipeline?.$match?.[softDeleted.softDeletedField]
                ) {
                  return true;
                }
                return false;
              })
            ) {
              pipelines.unshift(softDeleted.nonDeletedPipelineMatchOptions);
            }

            pipelines.forEach(pipeline => {
              if (softDeleted.isPipelineStageLookup(pipeline)) {
                if (pipeline.$lookup.pipeline) {
                  pipeline.$lookup.pipeline.unshift(
                    softDeleted.nonDeletedPipelineMatchOptions,
                  );
                } else {
                  if (
                    !softDeleted.mongoDBVersion ||
                    softDeleted.mongoDBVersion >= '5'
                  ) {
                    pipeline.$lookup.pipeline = [
                      softDeleted.nonDeletedPipelineMatchOptions,
                    ];
                  } else {
                    if (softDeleted.mongoDBVersion < '3.6') {
                      throw new Error(
                        'Mongodb server version smaller than 3.6 does not support aggregate lookup pipeline overrides',
                      );
                    }

                    if (softDeleted.mongoDBVersion < '5') {
                      const letField = 'localField';
                      pipeline.$lookup = {
                        from: pipeline.$lookup.from,
                        let: { [letField]: `$${pipeline.$lookup.localField}` },
                        pipeline: [
                          softDeleted.nonDeletedPipelineMatchOptions,
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
                if (!write.filter?.[softDeleted.softDeletedField]) {
                  Object.assign(
                    write.filter || {},
                    softDeleted.nonDeletedFilterOptions,
                  );
                }
              }
            });
          } else if (overriddenMethod === 'distinct') {
            if (!args[1]?.[softDeleted.softDeletedField]) {
              args[1] = Object.assign(
                args[1] || {},
                softDeleted.nonDeletedFilterOptions,
              );
            }
          } else {
            if (!args[0]?.[softDeleted.softDeletedField]) {
              args[0] = Object.assign(
                args[0] || {},
                softDeleted.nonDeletedFilterOptions,
              );
            }
          }
          return Model[overriddenMethod].apply(this, args);
        };
      });
    };
  }
}
