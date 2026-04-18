import io
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from services.file_converter import convert_to_jpeg_pages
from PIL import Image

# test jpg
img = Image.new("RGB", (100, 100), color="blue")
buf = io.BytesIO()
img.save(buf, format="JPEG")
print("JPG:", len(convert_to_jpeg_pages(buf.getvalue(), "test.jpg")))

# test pdf (using fitz)
import fitz # PyMuPDF
doc = fitz.open()
page = doc.new_page()
doc.insert_page(0, width=595, height=842) # A4
buf = io.BytesIO()
doc.save(buf)
pdf_bytes = buf.getvalue()
res_pdf = convert_to_jpeg_pages(pdf_bytes, "test.pdf")
print("PDF Pages:", len(res_pdf))
