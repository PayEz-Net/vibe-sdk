# Basic CRUD Operations

Complete examples of Create, Read, Update, Delete operations with Vibe SDK.

---

## Server Component (Async/Await)

```typescript
// app/products/page.tsx
import { createVibeClient } from '@vibe/client';

export default async function ProductsPage() {
  const vibe = createVibeClient();

  // READ: List all products
  const { data: products, pagination } = await vibe
    .collection('products')
    .list({
      limit: 20,
      offset: 0,
      orderBy: 'created_at',
      orderDir: 'desc',
    });

  // READ: Get single product
  const product = await vibe.collection('products').get(123);

  // CREATE: New product
  const newProduct = await vibe.collection('products').create({
    name: 'New Product',
    price: 29.99,
    description: 'A great product',
  });

  // UPDATE: Update product
  await vibe.collection('products').update(123, {
    price: 19.99,
  });

  // DELETE: Remove product
  await vibe.collection('products').delete(123);

  return (
    <div>
      <h1>Products ({pagination.total})</h1>
      <ul>
        {products.map(p => (
          <li key={p.id}>
            {p.name} - ${p.price}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Client Component (React Hooks)

```typescript
// app/products/client.tsx
'use client';

import {
  useVibeCollection,
  useVibeDocument,
  useVibeCreate,
  useVibeUpdate,
  useVibeDelete,
} from '@vibe/client/react';
import { useState } from 'react';

export function ProductManager() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // READ: List all products
  const {
    data: products,
    isLoading: listLoading,
    error: listError,
    refetch,
  } = useVibeCollection('products', {
    limit: 20,
    orderBy: 'name',
    orderDir: 'asc',
  });

  // READ: Single product
  const {
    data: product,
    isLoading: detailLoading,
  } = useVibeDocument('products', selectedId);

  // CREATE: Mutation hook
  const createProduct = useVibeCreate('products');

  // UPDATE: Mutation hook
  const updateProduct = useVibeUpdate('products');

  // DELETE: Mutation hook
  const deleteProduct = useVibeDelete('products');

  // CREATE handler
  const handleCreate = async () => {
    await createProduct.mutateAsync({
      name: 'New Product',
      price: 29.99,
    });
    // List automatically refetches!
  };

  // UPDATE handler
  const handleUpdate = async (id: number) => {
    await updateProduct.mutateAsync({
      id,
      data: { price: 19.99 },
    });
    // Both list and detail queries refetch!
  };

  // DELETE handler
  const handleDelete = async (id: number) => {
    await deleteProduct.mutateAsync(id);
    // List refetches, detail query removed from cache
  };

  if (listLoading) return <div>Loading products...</div>;
  if (listError) return <div>Error: {listError.message}</div>;

  return (
    <div>
      <h1>Products</h1>

      <button onClick={handleCreate} disabled={createProduct.isLoading}>
        {createProduct.isLoading ? 'Creating...' : 'Create Product'}
      </button>

      <ul>
        {products?.map(p => (
          <li key={p.id}>
            {p.name} - ${p.price}
            <button onClick={() => setSelectedId(p.id)}>View</button>
            <button onClick={() => handleUpdate(p.id)}>Update</button>
            <button onClick={() => handleDelete(p.id)}>Delete</button>
          </li>
        ))}
      </ul>

      {selectedId && product && (
        <div>
          <h2>{product.name}</h2>
          <p>Price: ${product.price}</p>
          <p>Description: {product.description}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Filtering & Pagination

```typescript
const { data, pagination } = await vibe
  .collection('products')
  .list({
    limit: 20,
    offset: 0,
    orderBy: 'price',
    orderDir: 'asc',
    filter: {
      category: 'electronics',
      price: { operator: '>', value: 100 },
    },
  });

console.log(pagination);
// {
//   total: 150,
//   limit: 20,
//   offset: 0,
//   hasMore: true
// }
```

---

## Error Handling

```typescript
try {
  const product = await vibe.collection('products').get(999);
} catch (error) {
  if (error.code === 'NOT_FOUND') {
    console.log('Product not found');
  } else if (error.code === 'UNAUTHORIZED') {
    console.log('Not authenticated');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

---

## With Type Safety

```typescript
import type { Product } from '@vibe/types';

// Types are auto-generated from your VibeSQL schema!

const products = await vibe.collection<Product>('products').list();
// products.data is typed as Product[]

products.data[0].name;  // ✅ TypeScript knows this exists
products.data[0].xyz;   // ❌ TypeScript error!

// Create with type checking
const newProduct = await vibe.collection<Product>('products').create({
  name: 'Product',    // ✅ Required field
  price: 29.99,       // ✅ Required field
  xyz: 'invalid',     // ❌ TypeScript error - field doesn't exist
});
```

---

## Bulk Operations

```typescript
// Create multiple products
const products = [
  { name: 'Product 1', price: 10 },
  { name: 'Product 2', price: 20 },
  { name: 'Product 3', price: 30 },
];

for (const productData of products) {
  await vibe.collection('products').create(productData);
}

// Or use Promise.all for parallel creation
await Promise.all(
  products.map(data =>
    vibe.collection('products').create(data)
  )
);
```

---

## Complete Example: Product CRUD Page

```typescript
// app/products/page.tsx
'use client';

import {
  useVibeCollection,
  useVibeCreate,
  useVibeUpdate,
  useVibeDelete,
} from '@vibe/client/react';
import { useState } from 'react';

export default function ProductsPage() {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const { data: products, isLoading } = useVibeCollection('products');
  const create = useVibeCreate('products');
  const update = useVibeUpdate('products');
  const remove = useVibeDelete('products');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      name,
      price: parseFloat(price),
    });
    setName('');
    setPrice('');
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <h1>Products</h1>

      <form onSubmit={handleSubmit}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Product name"
          required
        />
        <input
          type="number"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="Price"
          required
        />
        <button type="submit" disabled={create.isLoading}>
          {create.isLoading ? 'Creating...' : 'Create Product'}
        </button>
      </form>

      <ul>
        {products?.map(product => (
          <li key={product.id}>
            <span>{product.name} - ${product.price}</span>
            <button
              onClick={() => update.mutateAsync({
                id: product.id,
                data: { price: product.price * 0.9 }, // 10% off
              })}
              disabled={update.isLoading}
            >
              Discount 10%
            </button>
            <button
              onClick={() => remove.mutateAsync(product.id)}
              disabled={remove.isLoading}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**That's it!** Full CRUD with type safety, automatic refetching, and zero configuration.
