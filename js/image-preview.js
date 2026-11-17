
const imageInput = document.getElementById("productImageFile");
const previewContainer = document.getElementById(
  "productImagePreviewContainer"
);
const previewImage = document.getElementById("productImagePreview");
const formMessage = document.getElementById("addProductMessage");

let previewObjectUrl = null;

function clearPreview() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  previewImage.removeAttribute("src");
  previewContainer.classList.add("hidden");
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];

  clearPreview();
  formMessage.textContent = "";

  if (!file) return;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    formMessage.textContent =
      "Please select a JPG, PNG or WEBP image.";

    imageInput.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    formMessage.textContent =
      "Image size must not exceed 5 MB.";

    imageInput.value = "";
    return;
  }

  previewObjectUrl = URL.createObjectURL(file);

  previewImage.src = previewObjectUrl;
  previewContainer.classList.remove("hidden");
});

export function resetProductImagePreview() {
  clearPreview();
  imageInput.value = "";
}
