function editRow(button, row_id) {

    $(button).toggleClass("d-none");
    $(button).siblings().toggleClass("d-none");

    let elements = $(`${row_id}`).find("[name]");

    elements.each(function () {
        let $element = $(this);
        $element.toggleClass("clean-input raw-input");
        $element.prop("readonly", !$element.prop("readonly"));
    });

}

async function updateRow(button, row_id, confirm, url, id, method = "POST") {

    let elements = $(`${row_id}`).find("[name]");
    let form_data = {};

    elements.each(function () {
        let name = $(this).attr("name");
        let value = $(this).val();
        form_data[name] = value;
    });

    $(button).find(".spinner-border").toggleClass("d-none");
    $(button).find(".fa").toggleClass("d-none");

    await updateData(confirm, url, id, method, form_data);

    $(button).find(".spinner-border").toggleClass("d-none");
    $(button).find(".fa").toggleClass("d-none");

}