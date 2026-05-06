# Database Schema: E-commerce Entity Model

## Question

> Show me the relationships between users, orders, and products.
> Which tables are involved and how do they connect?

## Without feynman

Users can place multiple orders. Each order contains one or more line items,
and each line item references a product. The users table has a primary key
that the orders table references via user_id. The order_items junction table
connects orders to products with a quantity field. Products belong to
categories via a category_id foreign key.

## With feynman

```
users                    orders                   products
─────────────────────    ─────────────────────    ─────────────────────
id (PK)                  id (PK)                  id (PK)
email (unique)           user_id (FK → users)     name
password_hash            created_at               price
created_at               status                   stock_count
                         total_amount             category_id (FK)
```

Entity relationships:

```
users
└── orders (user_id → users.id)
    └── order_items (order_id → orders.id)
        └── products (product_id → products.id)

categories
└── products (category_id → categories.id)
```

One user → many orders → many order_items → one product per item. Categories
are a separate hierarchy connected only to products.

## Why this works

A database schema is a hierarchy of related entities — feynman's tree-diagram
and comparison-column rules both activate. Side-by-side columns show each
table's fields at a glance; the tree shows foreign-key relationships across
three levels.
