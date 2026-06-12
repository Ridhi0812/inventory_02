# Use official Python image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies (important for psycopg2)
RUN apt-get update && apt-get install -y gcc libpq-dev

# Copy requirements first (for caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Expose Flask port (you are using 8000)
EXPOSE 8000

# Run using gunicorn (PRODUCTION READY)
CMD ["gunicorn", "-b", "0.0.0.0:8000", "backend:app"]
