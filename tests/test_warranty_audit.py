import unittest

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models import User, WarrantyItemType
from app.routers.warranty_items import create_warranty_item, update_warranty_item
from app.schemas import WarrantyItemCreate, WarrantyItemUpdate


class WarrantyAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.creator = User(
            username="warranty-creator",
            full_name="Kullanıcı A",
            hashed_password="unused",
            is_admin=True,
        )
        self.updater = User(
            username="warranty-updater",
            full_name="Kullanıcı B",
            hashed_password="unused",
            is_admin=True,
        )
        self.session.add_all([self.creator, self.updater])
        self.session.commit()
        self.session.refresh(self.creator)
        self.session.refresh(self.updater)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_creator_is_set_on_create_and_updater_only_after_update(self) -> None:
        created = create_warranty_item(
            WarrantyItemCreate(type=WarrantyItemType.DEVICE, name="Audit Fixture"),
            self.session,
            self.creator,
        )
        self.assertEqual(self.creator.id, created.created_by_id)
        self.assertEqual("Kullanıcı A", created.created_by_name)
        self.assertIsNone(created.updated_by_id)
        self.assertIsNone(created.updated_by_name)

        updated = update_warranty_item(
            created.id,
            WarrantyItemUpdate(note="Güncellendi"),
            self.session,
            self.updater,
        )
        self.assertEqual(self.creator.id, updated.created_by_id)
        self.assertEqual("Kullanıcı A", updated.created_by_name)
        self.assertEqual(self.updater.id, updated.updated_by_id)
        self.assertEqual("Kullanıcı B", updated.updated_by_name)


if __name__ == "__main__":
    unittest.main()
