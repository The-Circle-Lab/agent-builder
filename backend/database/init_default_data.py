"""
Default data when initialized
"""
from sqlmodel import select, Session as DBSession
from database.database import get_session
from database.db_models import Class, User
from services.auth import hash_pw


def create_default_data():
    for session in get_session():
        # Create a default admin user if none exists
        admin_user = session.exec(select(User).where(User.email == "admin@example.com")).first()
        if not admin_user:
            admin_user = User(
                email="admin@example.com",
                hashed_password=hash_pw("admin123"),
                student=False
            )
            session.add(admin_user)
            session.commit()
            session.refresh(admin_user)
            print("Created default admin user: admin@example.com / admin123")

        # Create a default class if none exists
        default_class = session.exec(select(Class).where(Class.code == "DEFAULT")).first()
        if not default_class:
            default_class = Class(
                code="DEFAULT",
                name="Default Class",
                description="Default class for workflows",
                admin_id=admin_user.id
            )
            session.add(default_class)
            session.commit()
            print("Created default class: DEFAULT")

        print("Default data initialization complete")
        break


if __name__ == "__main__":
    create_default_data() 
