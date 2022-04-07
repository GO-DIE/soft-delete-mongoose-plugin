soft-delete-mongoose-plugin
================

A simple and friendly soft delete plugin for mongoose，implementation using TS.

Methods were added and overridden on mongoose model to realize soft deletion logic.

# Features

- Soft delete data using soft delete flag and date markers is friendly for scenarios where a unique index needs to be created
- User-defined soft delete field names are supported
- [Add independent soft delete methods to the mongoose model](#soft-delete-methods), all hard delete methods are retained completely
- Rewrite all query and update methods on mongoose Model and automatically inject soft delete filtering conditions; If the user filter contains any queries related to soft delete fields, the program will assume that the user needs to have full control of the data and will not automatically inject soft delete filtering conditions



# Quick Start

## Install

```
$ npm install soft-delete-mongoose-plugin
```



## Usage

### Typescript

Use of the **SoftDeleteModel** type, instead of the **Model** type.

```typescript
import { set, Schema, model, connect, connection, plugin } from 'mongoose';
import { SoftDelete, SoftDeleteModel } from 'soft-delete-mongoose-plugin';

async function main() {
  set('debug', true);

  await connect('mongodb://localhost:27017/test?directConnection=true');

  // defind soft delete field name
  const IS_DELETED_FIELD = 'isDeleted';
  const DELETED_AT_FIELD = 'deletedAt';

  // use soft delete plugin
  plugin(
    new SoftDelete({
      isDeletedField: IS_DELETED_FIELD,
      deletedAtField: DELETED_AT_FIELD,
    }).getPlugin(),
  );

  interface ISoftDelete {
    [IS_DELETED_FIELD]: boolean;
    [DELETED_AT_FIELD]: Date | null;
  }

  interface IPerson extends ISoftDelete {
    name: string;
  }

  const personSchema = new Schema<IPerson>({
    name: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  });

  // use of the SoftDeleteModel type, instead of the Model type.
  const personModel = model<IPerson, SoftDeleteModel<IPerson>>(
    'persons',
    personSchema,
  );

  // It's ready to use studentModel to soft delete documents
  await personModel.softDeleteMany();

  await connection.close();
}

main();
```



### JavaScript

```javascript
const { set, Schema, model, connect, connection, plugin } = require('mongoose');
const { SoftDelete } = require('soft-delete-mongoose-plugin');

async function main() {
  set('debug', true);

  await connect('mongodb://localhost:27017/test?directConnection=true');

  // defind soft delete field name
  const IS_DELETED_FIELD = 'isDeleted';
  const DELETED_AT_FIELD = 'deletedAt';

  // use soft delete plugin
  plugin(
    new SoftDelete({
      isDeletedField: IS_DELETED_FIELD,
      deletedAtField: DELETED_AT_FIELD,
    }).getPlugin(),
  );

  const personSchema = new Schema({
    name: { type: String, required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  });

  // use of the SoftDeleteModel type, instead of the Model type.
  const personModel = model('persons', personSchema);

  // It's ready to use studentModel to soft delete documents
  await personModel.softDeleteMany();

  await connection.close();
}

main();
```



# API

## Class: SoftDelete

**Parameters：**

- *options* **\<Object\>**

    *isDeletedField* **\<string\>**  Soft delete flag field name, field type: **boolean**

    *deletedAtField* **\<string\>**  Soft delete date field name, field type: **Date | null**

    *mongoDBVersion*? **\<string\>**  Rewrite with better query statements based on the mongoDB version used, default the last MongoDB version

    *override* **\<OverrideOptions\>** Sets whether the specified method needs to be overridden

    

> Overridden model methods are supported by default：
>
> aggregate, bulkWrite, count, countDocuments, distinct, exists, find, findOne, findOneAndReplace, findOneAndUpdate, replaceOne, update, updateMany, updateOne



**Example usage:**

```typescript
new SoftDelete({
  isDeletedField: 'isDeleted',
  deletedAtField: 'deletedAt',
  mongoDBVersion: "5.0.5",
  override: { aggregate: false }, // not override aggregate method
});
```



## Method: softDelete.getPlugin

**return** **\<Function\>**  The mongoose plugin function



# Soft delete methods

Add independent soft delete methods to the mongoose model, the soft delete method actually calls the corresponding mongoose model update method：

| soft delete method    | update method     |
| --------------------- | ----------------- |
| softDeleteOne         | updateOne         |
| softDeleteMany        | updateMany        |
| findByIdAndSoftDelete | findByIdAndUpdate |

These functions take the same parameters as the corresponding update methods, except that the update option parameters are automatically replaced with soft delete field updates.  

