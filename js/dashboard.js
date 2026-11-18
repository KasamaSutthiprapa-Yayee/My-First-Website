
import { supabase } from "./supabase.js";
import { uploadProductImage } from "./storage.js";
import { resetProductImagePreview } from "./image-preview.js";

const storeIcons = {
  DAISO: "🏠",
  "OLIVE YOUNG": "🧴",
  CU: "🥤",
  GS25: "🍙",
  MUSINSA: "👕",
  EMART: "🛒",
  "NO BRAND": "🟡"
};

let activeWorkspaceId = null;
let activeExpandedStoreId = null;

export async function loadDashboard() {
  const message = document.getElementById("dashboardMessage");
  const storeGrid = document.getElementById("storeGrid");
  const addProductSection = document.getElementById("addProductSection");

  if (!message || !storeGrid || !addProductSection) {
    console.error("Dashboard elements are missing from index.html.");
    return;
  }

  message.textContent = "Loading shopping data...";

  try {
    // 1. Get the shared workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("id, name, currency_rate")
      .eq("name", "Korea Shopping 2026")
      .limit(1)
      .maybeSingle();

    if (workspaceError) throw workspaceError;
    if (!workspace) {
      throw new Error("Workspace not found or access denied.");
    }

    const workspaceId = workspace.id;
    activeWorkspaceId = workspaceId;

    const configuredCurrencyRate = Number(workspace.currency_rate);

    const currencyRate =
      Number.isFinite(configuredCurrencyRate) && configuredCurrencyRate > 0
        ? configuredCurrencyRate
        : 0.0253;

    // 2. Fetch stores, products and purchase progress
    const [storesResult, productsResult, purchasesResult] = await Promise.all([
      supabase
        .from("stores")
        .select("id, name, category, store_type, address, maps_url, phone, website, opening_hours, description, notes")
        .eq("workspace_id", workspaceId)
        .order("name"),

      supabase
        .from("products")
        .select(`
          id,
          store_id,
          name,
          image_url,
          price_krw,
          quantity,
          priority,
          notes
        `)
        .eq("workspace_id", workspaceId),

      supabase
        .from("purchases")
        .select("product_id, purchased_quantity")
        .eq("workspace_id", workspaceId)
    ]);

    if (storesResult.error) throw storesResult.error;
    if (productsResult.error) throw productsResult.error;
    if (purchasesResult.error) throw purchasesResult.error;

    const stores = storesResult.data || [];
    const products = productsResult.data || [];
    const purchases = purchasesResult.data || [];

    // 3. Calculate shopping progress

    const totalProducts = products.length;

    const totalQuantity = products.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

    const purchasedQuantity = purchases.reduce(
      (sum, item) => sum + Number(item.purchased_quantity || 0),
      0
    );

    const remainingQuantity = Math.max(
      totalQuantity - purchasedQuantity,
      0
    );

    // Calculate planned budget (price x quantity)
    const totalBudgetKRW = products.reduce(
      (sum, item) => {
        return sum +
          Number(item.price_krw || 0) *
          Number(item.quantity || 0);
      },
      0
    );

    const percentage = totalQuantity > 0
      ? Math.round(
          Math.min(purchasedQuantity / totalQuantity, 1) * 100
        )
      : 0;

    // 4. Update dashboard summary
    document.getElementById("workspaceName").textContent = workspace.name;
    document.getElementById("storeCount").textContent = stores.length;
    document.getElementById("productCount").textContent = totalProducts;
    document.getElementById("purchasedCount").textContent = purchasedQuantity;
    document.getElementById("remainingCount").textContent =
  remainingQuantity.toLocaleString("en-US");

document.getElementById("budgetKRW").textContent =
  `₩${totalBudgetKRW.toLocaleString("en-US")}`;

document.getElementById("budgetTHB").textContent =
  `ประมาณ ฿${Math.round(totalBudgetKRW * currencyRate).toLocaleString("en-US")}`;
    document.getElementById("progressPercent").textContent = `${percentage}%`;
    document.getElementById("progressBar").style.width = `${percentage}%`;

    document.getElementById("progressText").textContent =
      `${purchasedQuantity} of ${totalQuantity} items purchased`;

    // 5. Render expandable store cards
    storeGrid.replaceChildren();

    stores.forEach(store => {
      const storeProducts = products.filter(
        product => product.store_id === store.id
      );

      const storePurchased = storeProducts.reduce((sum, product) => {
        const purchase = purchases.find(
          item => item.product_id === product.id
        );

        return sum + Number(purchase?.purchased_quantity || 0);
      }, 0);

      // Store wrapper
      const storeItem = document.createElement("div");
      storeItem.className = "store-item";

      // Store card
      const card = document.createElement("article");
      card.className = "store-card";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-expanded", "false");

      const icon = document.createElement("div");
      icon.className = "store-icon";
      icon.textContent = (
        store.store_type === "restaurant"
          ? "🍽️"
          : (storeIcons[store.name] || "🛍️")
      );

      const title = document.createElement("h3");
      title.textContent = store.name;

      const category = document.createElement("p");
      category.textContent = store.store_type === "restaurant"
        ? (store.category || "Restaurant")
        : (store.category || "Shopping Store");

      const count = document.createElement("p");
      count.className = "store-count";
      count.textContent =
        `${storeProducts.length} ${
          store.store_type === "restaurant" ? "menu items" : "products"
        } · ${storePurchased} ${
          store.store_type === "restaurant" ? "tried" : "bought"
        }`;

      const expandHint = document.createElement("p");
      expandHint.className = "store-expand-hint";
      expandHint.textContent = storeProducts.length > 0
        ? (
          store.store_type === "restaurant"
            ? "Click to view menu ↓"
            : "Click to view products ↓"
        )
        : "No items yet";

      card.append(icon, title, category, count, expandHint);

      // Product list panel
      const productPanel = document.createElement("div");
      productPanel.className = "store-product-panel hidden";

      // Toggle store products
      function toggleStore() {
        const isOpen = !productPanel.classList.contains("hidden");
        activeExpandedStoreId = isOpen ? null : store.id;

        // Close other stores
        storeGrid.querySelectorAll(".store-product-panel").forEach(panel => {
          panel.classList.add("hidden");
        });

        storeGrid.querySelectorAll(".store-card").forEach(item => {
          item.setAttribute("aria-expanded", "false");
          item.classList.remove("active");
        });

        if (!isOpen) {
          productPanel.classList.remove("hidden");
          card.setAttribute("aria-expanded", "true");
          card.classList.add("active");
        }
      }

      card.addEventListener("click", toggleStore);

      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleStore();
        }
      });

      // Store management buttons
      const storeActions = document.createElement("div");
      storeActions.className = "store-management-actions";

      const editStoreButton = document.createElement("button");
      editStoreButton.type = "button";
      editStoreButton.className = "store-edit-button";
      editStoreButton.textContent = "✏️ Edit";

      const deleteStoreButton = document.createElement("button");
      deleteStoreButton.type = "button";
      deleteStoreButton.className = "store-delete-button";
      deleteStoreButton.textContent = "🗑️ Delete";

      editStoreButton.addEventListener("click", event => {
        event.stopPropagation();
        openStoreEditDialog(store, workspaceId);
      });

      deleteStoreButton.addEventListener("click", async event => {
        event.stopPropagation();

        const confirmed = confirm(
          `ต้องการลบ "${store.name}" ใช่หรือไม่?\n\n` +
          "ระบบจะลบได้เฉพาะร้านที่ไม่มีสินค้าและเมนูอาหารอยู่เท่านั้น"
        );

        if (!confirmed) return;

        deleteStoreButton.disabled = true;
        deleteStoreButton.textContent = "Checking...";

        try {
          // Protect existing products and menu items
          const { count, error: countError } = await supabase
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("store_id", store.id);

          if (countError) throw countError;

          if (count > 0) {
            alert(
              `ยังไม่สามารถลบร้าน "${store.name}" ได้ค่ะ\n\n` +
              `มีสินค้า/เมนูอาหารอยู่ ${count} รายการ\n` +
              "กรุณาย้ายหรือลบรายการเหล่านั้นก่อน"
            );
            return;
          }

          const { error: deleteError } = await supabase
            .from("stores")
            .delete()
            .eq("id", store.id)
            .eq("workspace_id", workspaceId);

          if (deleteError) throw deleteError;

          alert("ลบร้านเรียบร้อยแล้ว");
          await loadDashboard();

        } catch (error) {
          console.error("Delete Store Error:", error);
          alert("ไม่สามารถลบร้านได้: " + error.message);

        } finally {
          deleteStoreButton.disabled = false;
          deleteStoreButton.textContent = "🗑️ Delete";
        }
      });
    
      storeActions.append(editStoreButton, deleteStoreButton);

      // Render products or menu
      const panelTitle = document.createElement("h3");
      panelTitle.className = "store-product-title";
      panelTitle.textContent = store.store_type === "restaurant"
        ? `${store.name} Menu`
        : `${store.name} Products`;

      productPanel.appendChild(panelTitle);

      // Restaurant information
      if (store.store_type === "restaurant") {
        const info = document.createElement("div");
        info.className = "restaurant-info";

        const addInfo = (label, value) => {
          if (!value) return;
          const line = document.createElement("p");
          line.textContent = `${label}: ${value}`;
          info.appendChild(line);
        };

        addInfo("Address", store.address);
        addInfo("Phone", store.phone);
        addInfo("Opening hours", store.opening_hours);
        addInfo("About", store.description);
        addInfo("Notes", store.notes);

        if (store.maps_url) {
          const link = document.createElement("a");
          link.href = store.maps_url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Open in Google Maps ↗";
          link.className = "restaurant-link";
          info.appendChild(link);
        }

        if (store.website) {
          const link = document.createElement("a");
          link.href = store.website;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Visit website ↗";
          link.className = "restaurant-link";
          info.appendChild(link);
        }

        if (info.childElementCount) {
          productPanel.appendChild(info);
        }
      }

      if (storeProducts.length === 0) {
        const emptyMessage = document.createElement("p");
        emptyMessage.className = "empty-products";
        emptyMessage.textContent = store.store_type === "restaurant"
          ? "No menu items added to this restaurant yet."
          : "No products added to this store yet.";

        productPanel.appendChild(emptyMessage);

      } else {
        storeProducts.forEach(product => {
          const productCard = document.createElement("article");
          productCard.className = "product-card";

          // Product image
          if (product.image_url) {
            try {
              const imageUrl = new URL(product.image_url);

              if (["https:", "http:"].includes(imageUrl.protocol)) {
                const image = document.createElement("img");
                image.className = "product-image";
                image.src = imageUrl.href;
                image.alt = product.name;
                image.loading = "lazy";

                image.addEventListener("error", () => {
                  image.remove();
                });

                productCard.appendChild(image);
              }
            } catch {
              // Ignore invalid image URLs
            }
          }

          const details = document.createElement("div");
          details.className = "product-details";

          const productName = document.createElement("h4");
          productName.textContent = product.name;

          const price = document.createElement("p");
          price.className = "product-price";
          price.textContent = product.price_krw !== null
            ? `₩${Number(product.price_krw).toLocaleString("en-US")}`
            : "Price not specified";
          
const priceTHB = document.createElement("p");
priceTHB.className = "product-price-thb";

const exchangeRate = Number(workspace.currency_rate) || 0.0253;

priceTHB.textContent = product.price_krw !== null
  ? `ประมาณ ฿${Math.round(Number(product.price_krw) * exchangeRate).toLocaleString("th-TH")}`
  : "";
          
          const quantity = document.createElement("p");
          quantity.className = "product-info";
          quantity.textContent = `Quantity: ${product.quantity}`;

          const priority = document.createElement("p");
          priority.className = "product-info";
          priority.textContent = `Priority: ${product.priority || "normal"}`;

          details.append(
  productName,
  price,
  priceTHB,
  quantity,
  priority
);
          
          if (product.notes) {
            const notes = document.createElement("p");
            notes.className = "product-notes";
            notes.textContent = product.notes;
            details.appendChild(notes);
          }

          // Product action buttons
          const actions = document.createElement("div");
          actions.className = "product-actions";

          const purchase = purchases.find(
            item => item.product_id === product.id
          );

          const purchasedQty = Number(
            purchase?.purchased_quantity || 0
          );

          const gotItButton = document.createElement("button");
          gotItButton.type = "button";
          gotItButton.className = "product-got-button";
          gotItButton.textContent =
            purchasedQty >= Number(product.quantity || 1)
              ? "Got it ✓"
: "Got it!";

          gotItButton.classList.toggle(
            "is-complete",
            purchasedQty >= Number(product.quantity || 1)
          );

gotItButton.addEventListener("click", async () => {
  const maxQty = Number(product.quantity || 1);

  const nextQty = purchasedQty >= maxQty
    ? purchasedQty - 1
    : purchasedQty + 1;

  gotItButton.disabled = true;

  try {
    if (nextQty <= 0) {
      const { error } = await supabase
        .from("purchases")
        .delete()
        .eq("product_id", product.id)
        .eq("workspace_id", workspaceId);

      if (error) throw error;

    } else {
      const { error } = await supabase
        .from("purchases")
        .upsert({
          workspace_id: workspaceId,
          product_id: product.id,
          purchased_quantity: nextQty
        }, { onConflict: "product_id" });

      if (error) throw error;
    }
   
    activeExpandedStoreId = store.id;
    await loadDashboard();

  } catch (error) {
    console.error("Purchase progress error:", error);
    alert("Unable to update progress: " + error.message);
    gotItButton.disabled = false;
  }
});
          
          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "product-edit-button";
          editButton.textContent = "Edit";

          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "product-delete-button";
          deleteButton.textContent = "Delete";

          // Edit product
          editButton.addEventListener("click", () => {
            const dialog = document.createElement("dialog");
            dialog.className = "edit-product-dialog";

            const form = document.createElement("form");
            form.className = "edit-product-form";

            const heading = document.createElement("h2");
            heading.textContent = "Edit Product";

            const subtitle = document.createElement("p");
            subtitle.textContent = "Update your product details";

            function createField(
              labelText,
              id,
              inputType,
              value,
              placeholder = ""
            ) {
              const wrapper = document.createElement("div");
              wrapper.className = "edit-form-field";

              const label = document.createElement("label");
              label.htmlFor = id;
              label.textContent = labelText;

              const input = document.createElement("input");
              input.id = id;
              input.name = id;
              input.type = inputType;
              input.value = value ?? "";
              input.placeholder = placeholder;

              wrapper.append(label, input);

              return { wrapper, input };
            }

            const nameField = createField(
              "Product Name",
              "editProductName",
              "text",
              product.name,
              "Enter product name"
            );

            nameField.input.required = true;

            const imageField = createField(
              "Image URL",
              "editProductImage",
              "url",
              product.image_url,
              "Paste image URL (optional)"
            );

            // Upload image field
            const uploadWrapper = document.createElement("div");
            uploadWrapper.className =
              "edit-form-field edit-full-width";

            const uploadLabel = document.createElement("label");
            uploadLabel.textContent = "Upload Image";

            const uploadInput = document.createElement("input");
            uploadInput.type = "file";
            uploadInput.accept = "image/jpeg,image/png,image/webp";

            const uploadHint = document.createElement("p");
            uploadHint.className = "upload-hint";
            uploadHint.textContent =
              "JPG, PNG or WEBP · Maximum 5 MB";

            const previewContainer = document.createElement("div");
            previewContainer.className =
              "image-preview-container hidden";

            const previewImage = document.createElement("img");
            previewImage.className = "image-preview";
            previewImage.alt = "New product image preview";

            previewContainer.appendChild(previewImage);

            let editPreviewUrl = null;

            uploadInput.addEventListener("change", () => {
              if (editPreviewUrl) {
                URL.revokeObjectURL(editPreviewUrl);
                editPreviewUrl = null;
              }

              previewContainer.classList.add("hidden");
              previewImage.removeAttribute("src");

              const file = uploadInput.files?.[0];
              if (!file) return;

              const allowedTypes = [
                "image/jpeg",
                "image/png",
                "image/webp"
              ];

              if (!allowedTypes.includes(file.type)) {
                editMessage.textContent =
                  "Please select a JPG, PNG or WEBP image.";
                uploadInput.value = "";
                return;
              }

              if (file.size > 5 * 1024 * 1024) {
                editMessage.textContent =
                  "Image size must not exceed 5 MB.";
                uploadInput.value = "";
                return;
              }

              editMessage.textContent = "";

              editPreviewUrl = URL.createObjectURL(file);
              previewImage.src = editPreviewUrl;
              previewContainer.classList.remove("hidden");
            });

            uploadWrapper.append(
              uploadLabel,
              uploadInput,
              uploadHint,
              previewContainer
            );

            const priceField = createField(
              "Price (KRW)",
              "editProductPrice",
              "number",
              product.price_krw,
              "Enter price in KRW"
            );

            priceField.input.min = "0";
            priceField.input.step = "0.01";

            const quantityField = createField(
              "Quantity",
              "editProductQuantity",
              "number",
              product.quantity
            );

            quantityField.input.min = "1";
            quantityField.input.step = "1";
            quantityField.input.required = true;

            const priorityWrapper = document.createElement("div");
            priorityWrapper.className = "edit-form-field";

            const priorityLabel = document.createElement("label");
            priorityLabel.htmlFor = "editProductPriority";
            priorityLabel.textContent = "Priority";

            const prioritySelect = document.createElement("select");
            prioritySelect.id = "editProductPriority";
            prioritySelect.name = "editProductPriority";

            [
              ["must_buy", "Must Buy"],
              ["normal", "Normal"],
              ["optional", "Optional"]
            ].forEach(([value, labelText]) => {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = labelText;
              prioritySelect.appendChild(option);
            });

            prioritySelect.value = product.priority || "normal";

            priorityWrapper.append(
              priorityLabel,
              prioritySelect
            );

            const notesWrapper = document.createElement("div");
            notesWrapper.className =
              "edit-form-field edit-full-width";

            const notesLabel = document.createElement("label");
            notesLabel.htmlFor = "editProductNotes";
            notesLabel.textContent = "Notes";

            const notesInput = document.createElement("textarea");
            notesInput.id = "editProductNotes";
            notesInput.name = "editProductNotes";
            notesInput.rows = 4;
            notesInput.placeholder =
              "Add product details or notes";
            notesInput.value = product.notes || "";

            notesWrapper.append(notesLabel, notesInput);

            const editMessage = document.createElement("p");
            editMessage.className = "edit-form-message";

            const formActions = document.createElement("div");
            formActions.className = "edit-form-actions";

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className = "edit-cancel-button";
            cancelButton.textContent = "Cancel";

            const saveButton = document.createElement("button");
            saveButton.type = "submit";
            saveButton.className = "edit-save-button";
            saveButton.textContent = "Save Changes";

            formActions.append(cancelButton, saveButton);

            const grid = document.createElement("div");
            grid.className = "edit-form-grid";

            grid.append(
              nameField.wrapper,
              imageField.wrapper,
              uploadWrapper,
              priceField.wrapper,
              quantityField.wrapper,
              priorityWrapper,
              notesWrapper
            );

            form.append(
              heading,
              subtitle,
              grid,
              editMessage,
              formActions
            );

            dialog.appendChild(form);
            document.body.appendChild(dialog);

            cancelButton.addEventListener("click", () => {
              dialog.close();
            });

            dialog.addEventListener("close", () => {
              if (editPreviewUrl) {
                URL.revokeObjectURL(editPreviewUrl);
              }
              dialog.remove();
            });

            // Save edited product
            form.addEventListener("submit", async event => {
              event.preventDefault();

              const newName = nameField.input.value.trim();
              const newImage = imageField.input.value.trim();
              const priceText = priceField.input.value.trim();
              const quantityValue =
                Number(quantityField.input.value);
              const priorityValue = prioritySelect.value;
              const notesValue = notesInput.value.trim();

              const priceValue = priceText === ""
                ? null
                : Number(priceText);

              if (!newName) {
                editMessage.textContent =
                  "Product name is required.";
                return;
              }

              if (
                priceValue !== null &&
                (!Number.isFinite(priceValue) || priceValue < 0)
              ) {
                editMessage.textContent =
                  "Please enter a valid price.";
                return;
              }

              if (
                !Number.isInteger(quantityValue) ||
                quantityValue < 1
              ) {
                editMessage.textContent =
                  "Quantity must be a whole number greater than 0.";
                return;
              }

              if (
                !["must_buy", "normal", "optional"].includes(
                  priorityValue
                )
              ) {
                editMessage.textContent = "Invalid priority.";
                return;
              }

              saveButton.disabled = true;
              saveButton.textContent = "Saving...";
              editMessage.textContent = "";

              try {
                let finalEditImageUrl =
                  newImage || product.image_url || null;

                const newImageFile = uploadInput.files?.[0];

                if (newImageFile) {
                  editMessage.textContent = "Uploading image...";

                  finalEditImageUrl = await uploadProductImage(
                    newImageFile,
                    workspaceId
                  );
                }

                editMessage.textContent = "Saving product...";

                const { error } = await supabase
                  .from("products")
                  .update({
                    name: newName,
                    image_url: finalEditImageUrl,
                    price_krw: priceValue,
                    quantity: quantityValue,
                    priority: priorityValue,
                    notes: notesValue || null
                  })
                  .eq("id", product.id)
                  .eq("workspace_id", workspaceId);

                if (error) throw error;

                dialog.close();
                await loadDashboard();

              } catch (error) {
                console.error("Edit Product Error:", error);

                editMessage.textContent =
                  "Unable to update product: " + error.message;

                saveButton.disabled = false;
                saveButton.textContent = "Save Changes";
              }
            });

            dialog.showModal();
          });

          // Delete product
          deleteButton.addEventListener("click", async () => {
            const confirmed = confirm(
              `Are you sure you want to delete "${product.name}"?`
            );

            if (!confirmed) return;

            deleteButton.disabled = true;
            deleteButton.textContent = "Deleting...";

            try {
              const { error } = await supabase
                .from("products")
                .delete()
                .eq("id", product.id)
                .eq("workspace_id", workspaceId);

              if (error) throw error;

              alert("Product deleted successfully!");
              await loadDashboard();

            } catch (error) {
              console.error("Delete Product Error:", error);
              alert("Unable to delete product: " + error.message);

            } finally {
              deleteButton.disabled = false;
              deleteButton.textContent = "Delete";
            }
          });

          actions.append(
            gotItButton,
            editButton,
            deleteButton
          );

          details.appendChild(actions);

          productCard.appendChild(details);
          productPanel.appendChild(productCard);
        });
      }

     storeItem.append(card, storeActions, productPanel);
storeGrid.appendChild(storeItem);
      if (activeExpandedStoreId === store.id) {
  productPanel.classList.remove("hidden");
  card.setAttribute("aria-expanded", "true");
  card.classList.add("active");
}
    });

    // 6. Setup Add Product and Add Store forms
    setupAddProductForm(stores);
    setupAddStoreForm(workspaceId);

    addProductSection.classList.remove("hidden");

    message.textContent = "Shopping data loaded successfully.";

  } catch (error) {
    console.error("Dashboard Error:", error);

    message.textContent =
      "Unable to load shopping data: " + error.message;
  }
}

// 7. Setup Add Product form
function setupAddProductForm(stores) {
  const form = document.getElementById("addProductForm");
  const storeSelect = document.getElementById("productStore");

  if (!form || !storeSelect) {
    console.error("Add Product form elements are missing from index.html.");
    return;
  }

  // Populate store options
  storeSelect.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Select a store";
  storeSelect.appendChild(defaultOption);

  stores.forEach(store => {
    const option = document.createElement("option");
    option.value = store.id;
    option.textContent = store.name;
    storeSelect.appendChild(option);
  });

  const productHeading = document.querySelector(
    "#addProductSection .section-heading h2"
  );
  const productNameLabel = document.querySelector(
    'label[for="productName"]'
  );
  const addButton = document.getElementById("addProductButton");

  const updateProductFormLabels = () => {
    const selectedStore = stores.find(
      store => store.id === storeSelect.value
    );

    const isRestaurant =
      selectedStore?.store_type === "restaurant";

    if (productHeading) {
      productHeading.textContent = isRestaurant
        ? "Add Menu Item"
        : "Add New Product";
    }

    if (productNameLabel) {
      productNameLabel.textContent = isRestaurant
        ? "Menu Item Name"
        : "Product Name";
    }

    if (addButton && !addButton.disabled) {
      addButton.textContent = isRestaurant
        ? "Add Menu Item"
        : "Add Product";
    }
  };

  storeSelect.addEventListener("change", updateProductFormLabels);
  updateProductFormLabels();

  // Attach submit event only once
  if (form.dataset.listenerAttached === "true") return;

  form.dataset.listenerAttached = "true";

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const button = document.getElementById("addProductButton");
    const formMessage = document.getElementById("addProductMessage");

    const productName =
      document.getElementById("productName").value.trim();

    const storeId = storeSelect.value;

    const imageUrl =
      document.getElementById("productImage").value.trim();

    const imageFile =
      document.getElementById("productImageFile")?.files?.[0];

    const priceText =
      document.getElementById("productPrice").value.trim();

    const quantity = Number(
      document.getElementById("productQuantity").value
    );

    const priority =
      document.getElementById("productPriority").value;

    const notes =
      document.getElementById("productNotes").value.trim();

    if (!activeWorkspaceId) {
      formMessage.textContent = "Workspace is not available.";
      return;
    }

    if (
      !productName ||
      !storeId ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      formMessage.textContent = "Please check the required fields.";
      return;
    }

    const priceValue = priceText === ""
      ? null
      : Number(priceText);

    if (
      priceValue !== null &&
      (!Number.isFinite(priceValue) || priceValue < 0)
    ) {
      formMessage.textContent = "Please enter a valid price.";
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";
    formMessage.textContent = "";

    try {
      let finalImageUrl = imageUrl || null;

      // Upload selected image to Supabase Storage
      if (imageFile) {
        formMessage.textContent = "Uploading image...";

        finalImageUrl = await uploadProductImage(
          imageFile,
          activeWorkspaceId
        );
      }

      // Save product or menu item
      formMessage.textContent = "Saving...";

      const { error } = await supabase
        .from("products")
        .insert({
          workspace_id: activeWorkspaceId,
          store_id: storeId,
          name: productName,
          image_url: finalImageUrl,
          price_krw: priceValue,
          quantity,
          priority,
          notes: notes || null
        });

      if (error) throw error;

      form.reset();

      document.getElementById("productQuantity").value = 1;

      resetProductImagePreview();

      await loadDashboard();

      formMessage.textContent =
        "Product / menu item added successfully!";

    } catch (error) {
      console.error("Add Product Error:", error);

      formMessage.textContent =
        "Unable to add product: " + error.message;

    } finally {
      button.disabled = false;

      const selectedStore = stores.find(
        store => store.id === storeSelect.value
      );

      button.textContent =
        selectedStore?.store_type === "restaurant"
          ? "Add Menu Item"
          : "Add Product";
    }
  });
}

// 8. Setup Add Store / Restaurant form
function setupAddStoreForm(workspaceId) {
  const form = document.getElementById("addStoreForm");

  if (!form || form.dataset.listenerAttached === "true") {
    return;
  }

  form.dataset.listenerAttached = "true";

  const typeSelect = document.getElementById("newStoreType");
  const categoryLabel = document.getElementById("newStoreCategoryLabel");
  const addressFields = document.getElementById("restaurantFields");

  const updateStoreFields = () => {
    const isRestaurant = typeSelect?.value === "restaurant";

    addressFields?.classList.toggle("hidden", !isRestaurant);

    if (categoryLabel) {
      categoryLabel.textContent = isRestaurant
        ? "Cuisine / Category"
        : "Category";
    }
  };

  typeSelect?.addEventListener("change", updateStoreFields);
  updateStoreFields();

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const button = document.getElementById("addStoreButton");
    const message = document.getElementById("addStoreMessage");

    const name =
      document.getElementById("newStoreName").value.trim();

    const storeType = typeSelect.value;

    const category =
      document.getElementById("newStoreCategory").value.trim();

    if (!name) {
      message.textContent =
        "Please enter a store or restaurant name.";
      return;
    }

    // Check duplicate store name before creating
    const { data: existingStore, error: checkError } =
      await supabase
        .from("stores")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("name", name)
        .maybeSingle();

    if (checkError) {
      message.textContent =
        "Unable to check store name: " + checkError.message;
      return;
    }

    if (existingStore) {
      message.textContent =
        `ร้าน "${name}" มีอยู่แล้วในรายการ กรุณาใช้ชื่ออื่นค่ะ`;
      return;
    }

    const payload = {
      workspace_id: workspaceId,
      name,
      category: category || (
        storeType === "restaurant"
          ? "Restaurant"
          : "Shopping Store"
      ),
      store_type: storeType,

      address: storeType === "restaurant"
        ? document.getElementById("newStoreAddress").value.trim() || null
        : null,

      maps_url: storeType === "restaurant"
        ? document.getElementById("newStoreMaps").value.trim() || null
        : null,

      phone: storeType === "restaurant"
        ? document.getElementById("newStorePhone").value.trim() || null
        : null,

      website: storeType === "restaurant"
        ? document.getElementById("newStoreWebsite").value.trim() || null
        : null,

      opening_hours: storeType === "restaurant"
        ? document.getElementById("newStoreHours").value.trim() || null
        : null,

      description: storeType === "restaurant"
        ? document.getElementById("newStoreDescription").value.trim() || null
        : null,

      notes: storeType === "restaurant"
        ? document.getElementById("newStoreNotes").value.trim() || null
        : null
    };

    button.disabled = true;
    button.textContent = "Saving...";
    message.textContent = "";

    try {
      const { error } = await supabase
        .from("stores")
        .insert(payload);

      if (error) throw error;

      form.reset();
      updateStoreFields();

      await loadDashboard();

      message.textContent =
        "Store / restaurant added successfully!";

    } catch (error) {
      console.error("Add Store Error:", error);

      message.textContent =
        "Unable to add store: " + error.message;

    } finally {
      button.disabled = false;
      button.textContent = "Add Store / Restaurant";
    }
  });
}

// ========================================
// EDIT STORE / RESTAURANT
// ========================================

function openStoreEditDialog(store, workspaceId) {
  const dialog = document.createElement("dialog");
  dialog.className = "edit-product-dialog";

  const isRestaurant = store.store_type === "restaurant";

  dialog.innerHTML = `
    <form class="edit-product-form" id="editStoreForm">
      <h2>Edit Store / Restaurant</h2>
      <p>Update your place information</p>

      <div class="edit-form-grid">

        <div class="edit-form-field">
          <label for="editStoreType">Place Type</label>
          <select id="editStoreType">
            <option value="store">Shopping Store</option>
            <option value="restaurant">Restaurant</option>
          </select>
        </div>

        <div class="edit-form-field">
          <label for="editStoreName">Name</label>
          <input id="editStoreName" type="text" required>
        </div>

        <div class="edit-form-field">
          <label for="editStoreCategory">Category</label>
          <input id="editStoreCategory" type="text">
        </div>

        <div class="edit-form-field edit-full-width restaurant-edit-field">
          <label for="editStoreAddress">Address</label>
          <input id="editStoreAddress" type="text">
        </div>

        <div class="edit-form-field edit-full-width restaurant-edit-field">
          <label for="editStoreMaps">Google Maps URL</label>
          <input id="editStoreMaps" type="url">
        </div>

        <div class="edit-form-field restaurant-edit-field">
          <label for="editStorePhone">Phone</label>
          <input id="editStorePhone" type="tel">
        </div>

        <div class="edit-form-field restaurant-edit-field">
          <label for="editStoreWebsite">Website</label>
          <input id="editStoreWebsite" type="url">
        </div>

        <div class="edit-form-field edit-full-width restaurant-edit-field">
          <label for="editStoreHours">Opening Hours</label>
          <input id="editStoreHours" type="text">
        </div>

        <div class="edit-form-field edit-full-width restaurant-edit-field">
          <label for="editStoreDescription">Description</label>
          <textarea id="editStoreDescription" rows="3"></textarea>
        </div>

        <div class="edit-form-field edit-full-width restaurant-edit-field">
          <label for="editStoreNotes">Notes</label>
          <textarea id="editStoreNotes" rows="3"></textarea>
        </div>

      </div>

      <p id="editStoreMessage" class="edit-form-message"></p>

      <div class="edit-form-actions">
        <button type="button" class="edit-cancel-button" id="cancelStoreEdit">
          Cancel
        </button>
        <button type="submit" class="edit-save-button" id="saveStoreEdit">
          Save Changes
        </button>
      </div>
    </form>
  `;

  document.body.appendChild(dialog);

  const form = dialog.querySelector("#editStoreForm");
  const typeInput = dialog.querySelector("#editStoreType");
  const nameInput = dialog.querySelector("#editStoreName");
  const categoryInput = dialog.querySelector("#editStoreCategory");

  const restaurantFields = dialog.querySelectorAll(
    ".restaurant-edit-field"
  );

  const message = dialog.querySelector("#editStoreMessage");
  const saveButton = dialog.querySelector("#saveStoreEdit");

  // Fill current store information
  typeInput.value = store.store_type || "store";
  nameInput.value = store.name || "";
  categoryInput.value = store.category || "";

  dialog.querySelector("#editStoreAddress").value =
    store.address || "";

  dialog.querySelector("#editStoreMaps").value =
    store.maps_url || "";

  dialog.querySelector("#editStorePhone").value =
    store.phone || "";

  dialog.querySelector("#editStoreWebsite").value =
    store.website || "";

  dialog.querySelector("#editStoreHours").value =
    store.opening_hours || "";

  dialog.querySelector("#editStoreDescription").value =
    store.description || "";

  dialog.querySelector("#editStoreNotes").value =
    store.notes || "";

  function updateRestaurantFields() {
    const show = typeInput.value === "restaurant";

    restaurantFields.forEach(field => {
      field.classList.toggle("hidden", !show);
    });
  }

  typeInput.addEventListener("change", updateRestaurantFields);
  updateRestaurantFields();

  dialog.querySelector("#cancelStoreEdit").addEventListener(
    "click",
    () => dialog.close()
  );

  dialog.addEventListener("close", () => dialog.remove());

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = nameInput.value.trim();
    const storeType = typeInput.value;

    if (!name) {
      message.textContent = "Please enter a name.";
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    message.textContent = "";

    try {
      // Check duplicate name in this workspace
      const { data: duplicate, error: duplicateError } =
        await supabase
          .from("stores")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("name", name)
          .neq("id", store.id)
          .maybeSingle();

      if (duplicateError) throw duplicateError;

      if (duplicate) {
        message.textContent =
          "This store or restaurant name already exists.";
        return;
      }

      const payload = {
        name,
        store_type: storeType,
        category: categoryInput.value.trim() ||
          (storeType === "restaurant" ? "Restaurant" : "Shopping Store"),

        address: storeType === "restaurant"
          ? dialog.querySelector("#editStoreAddress").value.trim() || null
          : null,

        maps_url: storeType === "restaurant"
          ? dialog.querySelector("#editStoreMaps").value.trim() || null
          : null,

        phone: storeType === "restaurant"
          ? dialog.querySelector("#editStorePhone").value.trim() || null
          : null,

        website: storeType === "restaurant"
          ? dialog.querySelector("#editStoreWebsite").value.trim() || null
          : null,

        opening_hours: storeType === "restaurant"
          ? dialog.querySelector("#editStoreHours").value.trim() || null
          : null,

        description: storeType === "restaurant"
          ? dialog.querySelector("#editStoreDescription").value.trim() || null
          : null,

        notes: storeType === "restaurant"
          ? dialog.querySelector("#editStoreNotes").value.trim() || null
          : null
      };

      const { error } = await supabase
        .from("stores")
        .update(payload)
        .eq("id", store.id)
        .eq("workspace_id", workspaceId);

      if (error) throw error;

      dialog.close();
      await loadDashboard();

      alert("Store information updated successfully!");

    } catch (error) {
      console.error("Edit Store Error:", error);
      message.textContent =
        "Unable to update store: " + error.message;

    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "Save Changes";
    }
  });

  dialog.showModal();
}
