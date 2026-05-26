import streamlit as st

from sovereign.db import init_db
from sovereign.vendor_audit import audit_website
from sovereign.vendors import add_vendor, list_vendors, update_vendor_audit


init_db()

st.set_page_config(
    page_title="Sovereign Ops Intelligence",
    page_icon="🏛️",
    layout="wide",
)

st.title("Sovereign Ops Intelligence")
st.caption("Private operations intelligence for luxury properties.")

module = st.sidebar.radio(
    "Module",
    [
        "Dashboard",
        "Vendor Intelligence",
        "Estate Command",
        "Naples HomeWatch",
    ],
)

if module == "Dashboard":
    st.header("Command Dashboard")
    st.info("MVP shell ready.")

elif module == "Vendor Intelligence":
    st.header("Vendor Intelligence")

    with st.form("vendor_form"):
        st.subheader("Add Vendor")

        company_name = st.text_input("Company name")
        category = st.text_input("Category")
        service_area = st.text_input("Service area")
        website = st.text_input("Website")
        phone = st.text_input("Phone")
        email = st.text_input("Email")
        emergency_available = st.checkbox("Emergency available")
        license_status = st.text_input("License status")
        insurance_expiration = st.text_input("Insurance expiration")
        notes = st.text_area("Notes")

        submitted = st.form_submit_button("Save vendor")

    if submitted:
        if company_name:
            add_vendor(
                company_name,
                category,
                service_area,
                website,
                phone,
                email,
                emergency_available,
                license_status,
                insurance_expiration,
                notes,
            )
            st.success("Vendor saved.")
        else:
            st.error("Company name is required.")

    vendors_df = list_vendors()

    st.subheader("Vendor List")
    if vendors_df.empty:
        st.info("No vendors saved yet.")
    else:
        st.dataframe(vendors_df, use_container_width=True)

    st.subheader("Website Audit")

    if not vendors_df.empty:
        vendor_options = {
            f"{row['company_name']} - {row['id']}": row
            for _, row in vendors_df.iterrows()
        }

        selected_vendor_label = st.selectbox("Choose vendor", list(vendor_options.keys()))
        selected_vendor = vendor_options[selected_vendor_label]

        if st.button("Run and save website audit"):
            result = audit_website(selected_vendor["website"])
            st.json(result)

            if "error" not in result:
                update_vendor_audit(
                    int(selected_vendor["id"]),
                    int(result["score"]),
                    str(result),
                )
                st.success("Audit saved.")
    else:
        st.info("Add a vendor first.")

elif module == "Estate Command":
    st.header("Estate Command")
    st.write("Manage estate operations, vendors, incidents, and readiness.")

elif module == "Naples HomeWatch":
    st.header("Naples HomeWatch Command")
    st.write("Manage seasonal-home inspections, owner reports, and open issues.")
