import os
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, origins=os.getenv("CORS_ORIGINS", "*"))

app.config["SQLALCHEMY_DATABASE_URI"]        = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"]      = {"pool_pre_ping": True}

db = SQLAlchemy(app)


# models

class Product(db.Model):
    __tablename__ = "products"

    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(200), nullable=False)
    sku        = db.Column(db.String(100), unique=True, nullable=False)
    price      = db.Column(db.Numeric(12, 2), nullable=False)
    quantity   = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id":         self.id,
            "name":       self.name,
            "sku":        self.sku,
            "price":      float(self.price),
            "quantity":   self.quantity,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Customer(db.Model):
    __tablename__ = "customers"

    id         = db.Column(db.Integer, primary_key=True)
    name       = db.Column(db.String(200), nullable=False)
    email      = db.Column(db.String(255), unique=True, nullable=False)
    phone      = db.Column(db.String(50), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id":         self.id,
            "name":       self.name,
            "email":      self.email,
            "phone":      self.phone,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class OrderItem(db.Model):
    __tablename__ = "order_items"

    id         = db.Column(db.Integer, primary_key=True)
    order_id   = db.Column(db.Integer, db.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    quantity   = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)  # price locked at order time

    product = db.relationship("Product")

    def to_dict(self):
        return {
            "id":         self.id,
            "product_id": self.product_id,
            "quantity":   self.quantity,
            "unit_price": float(self.unit_price),
        }


class Order(db.Model):
    __tablename__ = "orders"

    id           = db.Column(db.Integer, primary_key=True)
    customer_id  = db.Column(db.Integer, db.ForeignKey("customers.id"), nullable=False)
    total_amount = db.Column(db.Numeric(14, 2), nullable=False, default=0)
    status       = db.Column(db.String(50), nullable=False, default="pending")
    created_at   = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    customer = db.relationship("Customer")
    items    = db.relationship("OrderItem", backref="order",
                               cascade="all, delete-orphan", lazy="joined")

    def to_dict(self):
        return {
            "id":            self.id,
            "customer_id":   self.customer_id,
            "customer_name": self.customer.name if self.customer else None,
            "total_amount":  float(self.total_amount),
            "status":        self.status,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
            "items":         [i.to_dict() for i in self.items],
        }


with app.app_context():
    db.create_all()


# small helpers so route code stays readable

def ok(data=None, message="Done.", code=200):
    body = {"success": True, "message": message}
    if data is not None:
        body["data"] = data
    return jsonify(body), code

def err(message="Something went wrong.", code=400):
    return jsonify({"success": False, "message": message}), code

def get_body(*required):
    data = request.get_json(silent=True)
    if not data:
        return None, err("Send a JSON body.", 400)
    missing = [f for f in required if f not in data or
               (isinstance(data[f], str) and not data[f].strip())]
    if missing:
        return None, err(f"Missing: {', '.join(missing)}", 400)
    return data, None


# health

@app.get("/")
def health():
    try:
        db.session.execute(text("SELECT 1"))
        return jsonify({"status": "ok", "db": True})
    except Exception:
        return jsonify({"status": "ok", "db": False})


# products

@app.get("/products")
def list_products():
    return jsonify([p.to_dict() for p in Product.query.order_by(Product.id).all()])

@app.get("/products/<int:pid>")
def get_product(pid):
    return jsonify(db.get_or_404(Product, pid).to_dict())

@app.post("/products")
def create_product():
    data, error = get_body("name", "sku", "price", "quantity")
    if error:
        return error

    try:
        price    = float(data["price"])
        quantity = int(data["quantity"])
        assert price >= 0 and quantity >= 0
    except (ValueError, AssertionError):
        return err("Price and quantity must be non-negative numbers.")

    sku = data["sku"].strip().upper()
    if Product.query.filter_by(sku=sku).first():
        return err(f"SKU '{sku}' already exists.")

    p = Product(name=data["name"].strip(), sku=sku, price=price, quantity=quantity)
    db.session.add(p)
    db.session.commit()
    return ok(p.to_dict(), "Product added successfully.", 201)

@app.put("/products/<int:pid>")
def update_product(pid):
    p    = db.get_or_404(Product, pid)
    data = request.get_json(silent=True) or {}

    if data.get("name", "").strip():
        p.name = data["name"].strip()

    if "price" in data:
        try:
            price = float(data["price"])
            assert price >= 0
            p.price = price
        except (ValueError, AssertionError):
            return err("Price must be a non-negative number.")

    if "quantity" in data:
        try:
            qty = int(data["quantity"])
            assert qty >= 0
            p.quantity = qty
        except (ValueError, AssertionError):
            return err("Quantity must be a non-negative integer.")

    db.session.commit()
    return ok(p.to_dict(), "Product updated successfully.")

@app.delete("/products/<int:pid>")
def delete_product(pid):
    p = db.get_or_404(Product, pid)
    if OrderItem.query.filter_by(product_id=pid).first():
        return err("Can't delete — product is linked to existing orders.")
    db.session.delete(p)
    db.session.commit()
    return ok(message="Product deleted.")


# customers

@app.get("/customers")
def list_customers():
    return jsonify([c.to_dict() for c in Customer.query.order_by(Customer.id).all()])

@app.get("/customers/<int:cid>")
def get_customer(cid):
    return jsonify(db.get_or_404(Customer, cid).to_dict())

@app.post("/customers")
def create_customer():
    data, error = get_body("name", "email", "phone")
    if error:
        return error

    email = data["email"].strip().lower()
    if Customer.query.filter_by(email=email).first():
        return err(f"Email '{email}' is already registered.")

    c = Customer(name=data["name"].strip(), email=email, phone=data["phone"].strip())
    db.session.add(c)
    db.session.commit()
    return ok(c.to_dict(), "Customer added successfully.", 201)

@app.delete("/customers/<int:cid>")
def delete_customer(cid):
    c = db.get_or_404(Customer, cid)
    db.session.delete(c)
    db.session.commit()
    return ok(message="Customer removed.")


# orders

@app.get("/orders")
def list_orders():
    return jsonify([o.to_dict() for o in Order.query.order_by(Order.id).all()])

@app.get("/orders/<int:oid>")
def get_order(oid):
    return jsonify(db.get_or_404(Order, oid).to_dict())

@app.post("/orders")
def create_order():
    data, error = get_body("customer_id", "items")
    if error:
        return error

    customer = db.session.get(Customer, int(data["customer_id"]))
    if not customer:
        return err(f"Customer #{data['customer_id']} not found.")

    items = data.get("items", [])
    if not items:
        return err("Order needs at least one item.")

    pids = [i.get("product_id") for i in items]
    if len(pids) != len(set(pids)):
        return err("Same product appears twice — combine the quantities.")

    total    = 0.0
    resolved = []

    for item in items:
        try:
            pid = int(item["product_id"])
            qty = int(item["quantity"])
            assert qty >= 1
        except (KeyError, ValueError, AssertionError):
            return err("Each item needs product_id and quantity >= 1.")

        product = db.session.get(Product, pid)
        if not product:
            return err(f"Product #{pid} not found.")
        if product.quantity < qty:
            return err(f"Not enough stock for '{product.name}' (have {product.quantity}, need {qty}).")

        resolved.append((product, qty))
        total += float(product.price) * qty

    order = Order(customer_id=customer.id, total_amount=round(total, 2))
    db.session.add(order)
    db.session.flush()

    for product, qty in resolved:
        product.quantity -= qty
        db.session.add(OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=qty,
            unit_price=product.price
        ))

    db.session.commit()
    return ok(order.to_dict(), "Order placed successfully.", 201)

@app.delete("/orders/<int:oid>")
def cancel_order(oid):
    order = db.get_or_404(Order, oid)

    if order.status == "completed":
        return err("Can't cancel a completed order.")

    for item in order.items:
        product = db.session.get(Product, item.product_id)
        if product:
            product.quantity += item.quantity

    order.status = "cancelled"
    db.session.commit()
    return ok(message="Order cancelled and stock restored.")


if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("FLASK_PORT", 8000)),
        debug=os.getenv("FLASK_DEBUG", "false").lower() == "true"
    )
