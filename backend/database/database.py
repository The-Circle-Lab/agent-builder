from sqlmodel import SQLModel, create_engine, Session


sqlite_url = "sqlite:///./database/app.db"
engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})


def get_session():
    with Session(engine) as session:
        yield session


def init_db():
    SQLModel.metadata.create_all(engine)


def shutdown_db():
    engine.dispose()
