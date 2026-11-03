from datetime import date, timedelta
from unittest import TestCase

from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.models import User, WarrantyItem, WarrantyItemType
from app.routers.warranty_items import list_warranty_items


class WarrantySearchTests(TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(self.engine)

    @staticmethod
    def _production_shape_fixture() -> list[WarrantyItem]:
        rows: list[WarrantyItem] = []
        rows.extend(
            WarrantyItem(
                type=WarrantyItemType.DEVICE,
                name=f"Donanım {index:03d}",
                serial_number="DEVICE-NEEDLE" if index == 1 else f"DEV-{index:03d}",
            )
            for index in range(1, 102)
        )
        rows.extend(
            WarrantyItem(type=WarrantyItemType.SERVICE, name=f"Yazılım {index:03d}")
            for index in range(1, 37)
        )
        rows.extend(
            WarrantyItem(
                type=WarrantyItemType.DOMAIN_SSL,
                name=f"Domain {index:03d}",
                domain=f"domain-{index:03d}.example",
            )
            for index in range(1, 50)
        )
        rows.extend(
            WarrantyItem(
                type=WarrantyItemType.SSL,
                name=f"SSL {index:03d}",
                certificate_issuer="SSL-NEEDLE" if index == 1 else f"Issuer {index:03d}",
            )
            for index in range(1, 10)
        )
        return rows

    def test_tabs_keep_all_four_real_types_and_search_ignores_selected_type(self) -> None:
        with Session(self.engine) as session:
            user = User(username="search-test", email="search@test.local", hashed_password="x")
            session.add(user)
            session.add_all(self._production_shape_fixture())
            session.commit()

            expected_counts = {
                WarrantyItemType.DEVICE: 101,
                WarrantyItemType.SERVICE: 36,
                WarrantyItemType.DOMAIN_SSL: 49,
                WarrantyItemType.SSL: 9,
            }
            for item_type, expected_count in expected_counts.items():
                tab_rows = list_warranty_items(item_type=item_type, session=session, _=user)
                self.assertEqual(len(tab_rows), expected_count)
                self.assertEqual({row.type for row in tab_rows}, {item_type})

            device_result = list_warranty_items(
                search="DEVICE-NEEDLE",
                item_type=WarrantyItemType.DEVICE,
                session=session,
                _=user,
            )
            ssl_result_from_hardware = list_warranty_items(
                search="SSL-NEEDLE",
                item_type=WarrantyItemType.DEVICE,
                session=session,
                _=user,
            )
            hardware_after_clear = list_warranty_items(
                search="", item_type=WarrantyItemType.DEVICE, session=session, _=user
            )

        self.assertEqual(
            [(row.type, row.name) for row in device_result],
            [(WarrantyItemType.DEVICE, "Donanım 001")],
        )
        self.assertEqual(
            [(row.type, row.name) for row in ssl_result_from_hardware],
            [(WarrantyItemType.SSL, "SSL 001")],
        )
        self.assertEqual(len(hardware_after_clear), 101)
        self.assertEqual({row.type for row in hardware_after_clear}, {WarrantyItemType.DEVICE})
        self.assertEqual(sum(expected_counts.values()), 195)

    def test_search_returns_distinguishing_device_fields_and_creator(self) -> None:
        with Session(self.engine) as session:
            user = User(
                username="search-owner",
                full_name="Garanti Sorumlusu",
                email="owner@test.local",
                hashed_password="x",
            )
            session.add(user)
            session.commit()
            session.refresh(user)

            end_date = date.today() + timedelta(days=30)
            session.add_all(
                [
                    WarrantyItem(
                        type=WarrantyItemType.DEVICE,
                        name="Merkez Dizüstü",
                        brand="Lenovo",
                        model="ThinkPad T14",
                        serial_number="T14-ALPHA-001",
                        purchased_from="Örnek Teknoloji",
                        end_date=end_date,
                        created_by_id=user.id,
                    ),
                    WarrantyItem(
                        type=WarrantyItemType.DEVICE,
                        name="Şube Dizüstü",
                        brand="Lenovo",
                        model="ThinkPad T14",
                        serial_number="T14-BETA-002",
                        purchased_from="Örnek Teknoloji",
                        end_date=end_date,
                        created_by_id=user.id,
                    ),
                    WarrantyItem(
                        type=WarrantyItemType.DOMAIN_SSL,
                        name="example.test",
                        domain="example.test",
                        purchased_from="Hosting Kaynağı",
                        created_by_id=user.id,
                    ),
                ]
            )
            session.commit()

            serial_result = list_warranty_items(
                search="t14-alpha-001", session=session, _=user
            )
            brand_result = list_warranty_items(search="LENOVO", session=session, _=user)
            model_result = list_warranty_items(search="thinkpad t14", session=session, _=user)
            source_result = list_warranty_items(
                search="örnek teknoloji", session=session, _=user
            )
            missing_device_fields = list_warranty_items(
                search="example.test", session=session, _=user
            )

        self.assertEqual([row.serial_number for row in serial_result], ["T14-ALPHA-001"])
        for result in (brand_result, model_result, source_result):
            self.assertEqual(
                {row.serial_number for row in result},
                {"T14-ALPHA-001", "T14-BETA-002"},
            )
            self.assertEqual({row.brand for row in result}, {"Lenovo"})
            self.assertEqual({row.model for row in result}, {"ThinkPad T14"})
            self.assertEqual({row.created_by_name for row in result}, {"Garanti Sorumlusu"})
            self.assertEqual({row.days_left for row in result}, {30})
            self.assertEqual({row.computed_status for row in result}, {"Yaklaşıyor"})

        self.assertEqual(len(missing_device_fields), 1)
        self.assertEqual(missing_device_fields[0].type, WarrantyItemType.DOMAIN_SSL)
        self.assertIsNone(missing_device_fields[0].brand)
        self.assertIsNone(missing_device_fields[0].model)
        self.assertIsNone(missing_device_fields[0].serial_number)


if __name__ == "__main__":
    import unittest

    unittest.main()
