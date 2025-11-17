import csv
import re
import unicodedata
from pathlib import Path

RAW_TABLE = """Bütçe KalemiMap-Capex or OpexNitelikOcak 26Şubat 26Mart 26Nisan 26Mayıs 26Haziran 26Temmuz 26Ağustos 26Eylül 26Ekim 26Kasım 26Aralık 26KÜMÜLE 2026
ŞAN Cep Telefonu + Çakmaklık Şarj + Kılıf + Koruyucu  (500 Adet)CapexDonanım$50.000,00$0,00$0,00$0,00$0,00$50.000,00$0,00$0,00$0,00$50.000,00$0,00$0,00$150.000,00
Aktarma Giyebilir Okuyucu + Cep Telefonu + Kılıf (200 Adet)CapexDonanım$0,00$89.200,00$0,00$0,00$0,00$89.200,00$0,00$0,00$89.200,00$0,00$0,00$0,00$267.600,00
Aktarma Android El Terminali  (210 Adet)CapexDonanım$54.600,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$54.600,00
Şube Android El Terminali (500 Adet)CapexDonanım$0,00$152.750,00$0,00$0,00$0,00$0,00$152.750,00$0,00$0,00$0,00$0,00$0,00$305.500,00
Notebook + Mouse + Çanta(80 Adet)CapexDonanım$55.000,00$0,00$0,00$0,00$0,00$0,00$0,00$55.000,00$0,00$0,00$0,00$0,00$110.000,00
Lazer Yazıcı (100 Adet)CapexDonanım$0,00$0,00$22.875,00$0,00$0,00$0,00$0,00$22.875,00$0,00$0,00$0,00$0,00$45.750,00
12 Port POE Switch Saha (800 Adet)CapexDonanım$0,00$0,00$0,00$170.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$170.000,00
Access Point (25 Adet)CapexDonanım$0,00$0,00$0,00$0,00$0,00$2.500,00$0,00$0,00$0,00$0,00$0,00$0,00$2.500,00
All In One Pc (75 Adet)CapexDonanım$0,00$0,00$18.360,00$0,00$0,00$18.360,00$0,00$0,00$18.360,00$0,00$0,00$0,00$55.080,00
Barkod Yazıcı (200 Adet)CapexDonanım$0,00$10.000,00$0,00$0,00$0,00$0,00$10.000,00$0,00$0,00$10.000,00$0,00$0,00$30.000,00
Saha Network Kabinet 4U (700 Adet)CapexDonanım$0,00$8.700,00$0,00$0,00$8.700,00$0,00$0,00$8.700,00$0,00$0,00$0,00$0,00$26.100,00
Thin Client (250 Adet)CapexDonanım$58.437,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$58.437,00
Monitör + VGA (250 Adet)CapexDonanım$0,00$0,00$25.000,00$0,00$0,00$0,00$0,00$0,00$25.000,00$0,00$0,00$0,00$50.000,00
3 Party Yazılım Destekleyici Donanım İhtiyacıCapexDonanım$15.000,00$0,00$0,00$15.000,00$0,00$0,00$15.000,00$0,00$0,00$15.000,00$0,00$0,00$60.000,00
Barkod Okuyucu Kablosuz (100 Adet)CapexDonanım$10.500,00$0,00$0,00$0,00$0,00$10.500,00$0,00$0,00$0,00$10.500,00$0,00$0,00$31.500,00
Ürün/Donanım Tamirat (12 Ay)OpexHizmet$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$36.000,00
Teknik Donanım Sarf MalzemeOpexDonanım$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$3.250,00$39.000,00
CCTV Kullanma Bedeli (4150 Kamera)OpexYazılım$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$3.046,70$36.560,40
MDM Lisans Arttırma (1500 Adet) TT - $36K Ödeme 12 AyOpexYazılım$0,00$0,00$0,00$0,00$0,00$0,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$18.000,00
Barkod Okuyucu Kablolu (50 Adet)CapexDonanım$0,00$0,00$1.550,00$0,00$0,00$0,00$0,00$1.550,00$0,00$0,00$0,00$0,00$3.100,00
Mobil Barkod Yazıcı (100 Adet)CapexDonanım$18.750,00$0,00$0,00$18.750,00$0,00$0,00$18.750,00$0,00$0,00$18.750,00$0,00$0,00$75.000,00
All In One Lazer Yazıcı ( 50 Adet)CapexDonanım$16.250,00$0,00$0,00$0,00$0,00$0,00$16.250,00$0,00$0,00$0,00$0,00$0,00$32.500,00
MacBook Air (2 Adet)CapexDonanım$0,00$0,00$3.000,00$0,00$0,00$0,00$3.000,00$0,00$0,00$0,00$0,00$0,00$6.000,00
Toplantı ve Video Konferans SistemleriCapexDonanım$0,00$10.000,00$0,00$0,00$10.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$20.000,00
Projeksiyon Cihazı (10 Adet)CapexDonanım$2.500,00$0,00$0,00$0,00$2.500,00$0,00$0,00$2.500,00$0,00$0,00$2.500,00$0,00$10.000,00
DVR ((120 Adet)CapexDonanım$0,00$0,00$0,00$4.800,00$0,00$0,00$0,00$0,00$4.800,00$0,00$0,00$0,00$9.600,00
IP Telefon + Adaptör (300 Adet)CapexDonanım$4.500,00$0,00$0,00$0,00$0,00$0,00$4.500,00$0,00$0,00$0,00$0,00$0,00$9.000,00
Kamera 900 Adet)CapexDonanım$0,00$0,00$6.750,00$0,00$0,00$0,00$6.750,00$0,00$0,00$0,00$0,00$0,00$13.500,00
Birim açılış/taşıma giderleri.OpexHizmet$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$2.000,00$24.000,00
Barkod Görselleştirme Sunucu SatınalmaCapexDonanım$24.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$24.000,00
Güvenlik ÜrünleriOpexYazılım$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$30.000,00$360.000,00
Disaster Felaket Kurtarma (12 Ay) - $25K Mayıs itibariyle Aylık ÖdenecekOpexHizmet$0,00$0,00$0,00$0,00$25.000,00$25.000,00$25.000,00$25.000,00$25.000,00$25.000,00$25.000,00$25.000,00$200.000,00
Disaster Felaket Kurtarma (12 Ay)CapexDonanım$0,00$700.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$700.000,00
Dış Kaynak Yazılım Geliştirme Kod TransferiCapexHizmet$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$39.000,00$468.000,00
ERP Ek geliştirme ihtiyaçlarıCapexHizmet$0,00$0,00$14.000,00$0,00$0,00$14.000,00$0,00$0,00$14.000,00$0,00$0,00$14.000,00$56.000,00
Dış Kaynak Yazılım Geliştirme BakımOpexBakım$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$9.375,00$112.500,00
VeriMerkezi Barındırma+ Enerji Gideri (12 Ay)OpexHizmet$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$13.500,00$162.000,00
EğitimOpexHizmet$5.850,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$5.850,00$0,00$0,00$0,00$11.700,00
SIEM + SOC Aylık Ödeme (12 Ay)OpexHizmet$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$2.560,00$30.720,00
Yazılım Geliştirme component (12 Ay)OpexYazılım$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$3.125,00$37.500,00
Veri Tabanı Bakım/Destek CapexHizmet$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$15.000,00$180.000,00
Proje Yönetimi Uygulaması - $25K Ödeme 12 AyOpexYazılım$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$2.083,00$24.996,00
DDOS Aylık Ödeme (12 Ay)OpexHizmet$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$1.000,00$12.000,00
BTK-Esenyurt MPLS Devre (12 Ay)OpexHizmet$87,00$87,00$87,00$87,00$87,00$87,00$87,00$87,00$87,00$87,00$87,00$87,00$1.044,00
Domain/SSL Yenileme (12 Ay)OpexHizmet$167,00$167,00$167,00$167,00$167,00$167,00$167,00$167,00$167,00$167,00$167,00$167,00$2.004,00
F5 LoadBlancer Bakım/Destek (2 Adet) - $20K Ödeme 12 AyOpexBakım$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$1.670,00$20.040,00
Mail Arşiv Bakım/Destek (12 Ay) - $7500 Ödeme 12 AyOpexBakım$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$1.250,00$15.000,00
Mail Arşiv Lisans (12 Ay) - $40K Ödeme 12 AyOpexYazılım$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$3.350,00$40.200,00
Logo Bakım/DestekOpexBakım$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$1.720,00$20.640,00
Harita Servisi (12 Ay) - $67K Ocak Ödenecek 12 AyOpexYazılım$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$5.600,00$67.200,00
2 x Cisco 9500 Omurga + 10 x Cisco 9300 Kenar Garanti/Bakım - $35K Nisan Ödeme 12 AyOpexBakım$0,00$0,00$0,00$3.900,00$3.900,00$3.900,00$3.900,00$3.900,00$3.900,00$3.900,00$3.900,00$3.900,00$35.100,00
Veeam Backup Bakım/Destek / Lisans  (12 Ay)  -$36K Mart Ödeme 12 Ay GeçerliOpexBakım$0,00$0,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$30.000,00
Terminal Server Bakım/Destek (4 Adet R640) - $40K Nisan Ödeme 12 AyOpexBakım$0,00$0,00$0,00$3.335,00$3.335,00$3.335,00$3.335,00$3.335,00$3.335,00$3.335,00$3.335,00$3.335,00$30.015,00
Terminal Server Bakım/Destek (3 Adet R740) - $40K Ekim Ödeme 12 AyOpexBakım$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$3.335,00$3.335,00$3.335,00$10.005,00
Yedekleme Ünitesi Bakım/Destek (Datadomain 12 Ay) - $30K Temmuz Ödeme 12 AyOpexBakım$0,00$0,00$0,00$0,00$0,00$0,00$2.500,00$2.500,00$2.500,00$2.500,00$2.500,00$2.500,00$15.000,00
Yedekleme Ünitesi Satınalma 400TBCapexBakım$0,00$250.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$250.000,00
Antispam Bakım/Destek (12 Ay) - $7700 Haziran Ödeme 12 AyOpexBakım$0,00$0,00$0,00$0,00$0,00$641,00$641,00$641,00$641,00$641,00$641,00$641,00$4.487,00
27001 Danışmanlık (1 Adet)OpexHizmet$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$6.500,00$0,00$0,00$0,00$6.500,00
Lenova ThinkSystem SR590 - $20K Mayıs ödeme 12 AyOpexBakım$0,00$0,00$0,00$0,00$1.666,00$1.666,00$1.666,00$1.666,00$1.666,00$1.666,00$1.666,00$1.666,00$13.328,00
Authtake MFA - $40K Ağustos Ödeme 12 AyOpexHizmet$0,00$0,00$0,00$0,00$0,00$0,00$0,00$3.000,00$3.000,00$3.000,00$3.000,00$3.000,00$15.000,00
Peplink Balance 20X Router Lisans /Bakım Destek/Garanti -$82K Ocak ödeme 24 Ay geçerliOpexBakım$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$3.420,00$41.040,00
Peplink Balance 20X Modem Lisans /Bakım Destek/Garanti - $72K Ocak ödeme 24 Ay geçerliOpexBakım$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$3.042,00$36.504,00
SDWAN Modem (50 Adet)CapexDonanım$0,00$0,00$12.000,00$0,00$0,00$12.000,00$0,00$0,00$12.000,00$0,00$0,00$0,00$36.000,00
SOCRadar - $20K Ocak ödeme 12 ay geçerliOpexHizmet$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$1.700,00$20.400,00
Cymulate Lisans - $67K Haziran ödeme 12 Ay geçerliOpexHizmet$0,00$0,00$0,00$0,00$0,00$5.590,00$5.590,00$5.590,00$5.590,00$5.590,00$5.590,00$5.590,00$39.130,00
Yeni Sorter (4Adet) Donanım İhtiyaçlarıCapexDonanım$0,00$0,00$30.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$30.000,00
Storage Satınalma  200 TB CapexDonanım$0,00$300.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$300.000,00
Sunucu Satınalma (2026 Büyüme)4 Adet )CapexDonanım$0,00$160.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$160.000,00
Sunucu Satınalma (2025 Alamazsak)4 Adet )CapexDonanım$0,00$160.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$160.000,00
Regülasyon gereğince + %10 Büyüme Sunucu + StorageCapexDonanım$0,00$180.000,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$0,00$180.000,00
AI Yazılım Destekli Danışmanlık - $225K Mart ödeme Yıl sonuna kadar geçerliOpexYazılım$0,00$0,00$22.500,00$22.500,00$22.500,00$22.500,00$22.500,00$22.500,00$22.500,00$22.500,00$22.500,00$22.500,00$225.000,00
Azure Cloud Kullanım (Kullandıkça Öde)OpexHizmet$0,00$0,00$0,00$0,00$0,00$0,00$18.000,00$18.000,00$18.000,00$18.000,00$18.000,00$18.000,00$108.000,00
NVI Ücretli servise geçişOpexYazılım$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$10.000,00$120.000,00
Microsoft 2026 2. Taksit (Mevcut)CapexYazılım$0,00$0,00$0,00$0,00$0,00$413.476,00$0,00$0,00$0,00$0,00$0,00$0,00$413.476,00
Microsoft 2026 2. Taksit (Mevcut) - $458K Haziran ödeme 12 Ay geçerliOpexYazılım$0,00$0,00$0,00$0,00$0,00$38.110,00$38.110,00$38.110,00$38.110,00$38.110,00$38.110,00$38.110,00$266.770,00
Microsoft 2026 TrueUP - $192.6K Haziran ödeme 12 Ay geçerliOpexYazılım$0,00$0,00$0,00$0,00$0,00$17.000,00$17.000,00$17.000,00$17.000,00$17.000,00$17.000,00$17.000,00$119.000,00
Microsoft 2026 TrueUPCapexYazılım$0,00$0,00$0,00$0,00$0,00$82.944,00$0,00$0,00$0,00$0,00$0,00$0,00$82.944,00
MS Bakım DanışmanlıkOpexHizmet$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$6.700,00$80.400,00
Hypervisor Lisans (Vmware) - $500K Temmuz ödeme 12 Ay geçerliOpexYazılım$0,00$0,00$0,00$0,00$0,00$0,00$42.000,00$42.000,00$42.000,00$42.000,00$42.000,00$42.000,00$252.000,00"""

MONTH_MAP = {
    "Ocak 26": 1,
    "Şubat 26": 2,
    "Mart 26": 3,
    "Nisan 26": 4,
    "Mayıs 26": 5,
    "Haziran 26": 6,
    "Temmuz 26": 7,
    "Ağustos 26": 8,
    "Eylül 26": 9,
    "Ekim 26": 10,
    "Kasım 26": 11,
    "Aralık 26": 12,
}

HEADERS = [
    "type",
    "budget_code",
    "budget_name",
    "scenario",
    "year",
    "month",
    "amount",
    "date",
    "quantity",
    "unit_price",
    "vendor",
    "description",
    "out_of_budget",
    "map_category",
    "map_attribute",
]

REPLACEMENTS = {
    "Ş": "S",
    "ş": "s",
    "İ": "I",
    "ı": "i",
    "Ğ": "G",
    "ğ": "g",
    "Ü": "U",
    "ü": "u",
    "Ö": "O",
    "ö": "o",
    "Ç": "C",
    "ç": "c",
}

def slugify(name: str) -> str:
    text = name
    for src, dest in REPLACEMENTS.items():
        text = text.replace(src, dest)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^A-Za-z0-9]+", "_", text)
    return text.strip("_").upper()

def parse_amount(token: str) -> float:
    value = token.replace("$", "").replace(".", "").replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return 0.0

def parse_line(line: str):
    match = re.search(r"(Capex|Opex)", line)
    if not match:
        return None
    budget_name = line[: match.start()].strip()
    map_category = match.group(1)
    rest = line[match.end() :]
    attr_and_amounts = rest.strip()
    attr_match = re.match(r"([^$]+)", attr_and_amounts)
    if not attr_match:
        return None
    map_attribute = attr_match.group(1).strip()
    amounts_part = attr_and_amounts[attr_match.end() :]
    tokens = [tok for tok in re.findall(r"\$[0-9\.,A-Za-z]+", amounts_part) if tok and tok[0] == "$"]
    amounts = []
    for tok in tokens:
        body = tok[1:]
        if any(ch.isalpha() for ch in body):
            continue
        amounts.append(parse_amount(tok))
    if not amounts:
        return None
    return budget_name, map_category, map_attribute, amounts

def build_records():
    records = []
    lines = [ln.strip() for ln in RAW_TABLE.strip().splitlines() if ln.strip()]
    header, data_lines = lines[0], lines[1:]
    month_labels = list(MONTH_MAP.keys())
    for line in data_lines:
        parsed = parse_line(line)
        if not parsed:
            continue
        budget_name, map_category, map_attribute, amounts = parsed
        # Expect 13 values (12 months + cumulative); ignore extras
        month_amounts = amounts[: len(month_labels)]
        for label, month, amount in zip(month_labels, range(1, 13), month_amounts):
            if amount <= 0:
                continue
            records.append(
                {
                    "type": "plan",
                    "budget_code": slugify(budget_name),
                    "budget_name": budget_name,
                    "scenario": "Temel",
                    "year": 2026,
                    "month": month,
                    "amount": f"{amount:.2f}",
                    "date": "",
                    "quantity": "",
                    "unit_price": "",
                    "vendor": "",
                    "description": "",
                    "out_of_budget": "false",
                    "map_category": map_category.upper(),
                    "map_attribute": map_attribute,
                }
            )
    return records

def main():
    output_path = Path(__file__).resolve().parents[1] / "data" / "butce_plan_2026.csv"
    records = build_records()
    with output_path.open("w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=HEADERS)
        writer.writeheader()
        writer.writerows(records)
    print(f"Wrote {len(records)} plan satırı -> {output_path}")

if __name__ == "__main__":
    main()
