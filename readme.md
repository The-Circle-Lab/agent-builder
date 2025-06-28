# Agent Builder Prototype

A full-stack application for building and managing AI agent workflows with a React/Next.js frontend and FastAPI backend.

## Prerequisites

- **Python 3.8+** (for backend)
- **Node.js 18+** and **npm** (for frontend)
- **Docker** (for Qdrant vector database)

## Setup Instructions

### 1. Clone the Repository

```bash
git clone https://github.com/The-Circle-Lab/agent-builder
cd agent-builder
```

### 2. Start Qdrant Vector Database

The application requires a Qdrant vector database running in Docker:

```bash
docker run -p 6333:6333 qdrant/qdrant
```

This will start Qdrant on port 6333. Keep this running throughout development.

### 3. Backend Setup

Navigate to the backend directory and set up the Python environment:

```bash
cd backend
```

#### Create Virtual Environment (Recommended)

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### Install Dependencies

```bash
pip install -r requirements.txt
```

#### Environment Variables

Create a `.env` file in the `backend` directory based on the `.env.example` file:

```env
QDRANT_URL=http://localhost:6333
GOOGLE_CLOUD_PROJECT=your-cloud-project
AUTH_SECRET_KEY=your-secret-key
```

#### Run the Backend

```bash
uvicorn main:app --reload  
```

The backend API will be available at `http://localhost:8000`

### 4. Frontend Setup

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
```

#### Install Dependencies

```bash
npm install
```

#### Run the Frontend

```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`
