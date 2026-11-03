from unittest import TestCase

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.models import User, WarrantyItem, WarrantyItemType
from app.routers.warranty_items import (
    create_warranty_item,
    delete_warranty_item,
    router,
    update_warranty_item,
)
from app.schemas import WarrantyItemCreate, WarrantyItemUpdate


class WarrantyCrudTests(TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)
        with Session(self.engine) as session:
            self.admin = User(username="warranty-admin", hashed_password="x", is_admin=True)
            session.add(self.admin)
            session.commit()
            session.refresh(self.admin)
            session.expunge(self.admin)

    def test_all_four_real_types_are_stored_without_conversion(self) -> None:
        requests = [
            (WarrantyItemType.DEVICE, {"name": "Device A"}),
            (
                WarrantyItemType.DOMAIN_SSL,
                {"name": "example.internal", "domain": "example.internal"},
            ),
            (WarrantyItemType.SSL, {"name": "Wildcard SSL", "issuer": "OV"}),
            (WarrantyItemType.SERVICE, {"name": "Service A"}),
        ]

        with Session(self.engine) as session:
            created_ids: list[int] = []
            for item_type, fields in requests:
                result = create_warranty_item(
                    item_in=WarrantyItemCreate(type=item_type, **fields),
                    session=session,
                    current_user=self.admin,
                )
                self.assertEqual(result.type, item_type)
                created_ids.append(result.id)

            for item_id, (item_type, _) in zip(created_ids, requests):
                result = update_warranty_item(
                    item_id=item_id,
                    item_in=WarrantyItemUpdate(name=f"Updated {item_type.value}"),
                    session=session,
                    current_user=self.admin,
                )
                self.assertEqual(result.type, item_type)

            rows = session.exec(select(WarrantyItem).order_by(WarrantyItem.id)).all()

        post_route = next(
            route
            for route in router.routes
            if "POST" in route.methods and route.path == "/warranty-items"
        )
        self.assertEqual(post_route.status_code, 201)
        self.assertEqual([row.type for row in rows], [item_type for item_type, _ in requests])
        self.assertEqual(
            {item.value for item in WarrantyItemType},
            {"DEVICE", "SERVICE", "DOMAIN_SSL", "SSL"},
        )

    def test_device_edit_and_soft_delete_preserve_other_matching_device(self) -> None:
        with Session(self.engine) as session:
            first = create_warranty_item(
                item_in=WarrantyItemCreate(
                    type=WarrantyItemType.DEVICE,
                    name="Notebook A",
                    brand="Lenovo",
                    model="ThinkPad T14",
                    serial_number="SERIAL-A",
                ),
                session=session,
                current_user=self.admin,
            )
            second = create_warranty_item(
                item_in=WarrantyItemCreate(
                    type=WarrantyItemType.DEVICE,
                    name="Notebook B",
                    brand="Lenovo",
                    model="ThinkPad T14",
                    serial_number="SERIAL-B",
                ),
                session=session,
                current_user=self.admin,
            )

            updated = update_warranty_item(
                item_id=first.id,
                item_in=WarrantyItemUpdate(serial_number="SERIAL-A-UPDATED"),
                session=session,
                current_user=self.admin,
            )
            delete_warranty_item(
                item_id=first.id,
                delete_related=False,
                session=session,
                current_user=self.admin,
            )

            first_row = session.get(WarrantyItem, first.id)
            second_row = session.get(WarrantyItem, second.id)

        self.assertEqual(updated.serial_number, "SERIAL-A-UPDATED")
        self.assertFalse(first_row.is_active)
        self.assertEqual(first_row.serial_number, "SERIAL-A-UPDATED")
        self.assertTrue(second_row.is_active)
        self.assertEqual(second_row.serial_number, "SERIAL-B")


if __name__ == "__main__":
    import unittest

    unittest.main()
